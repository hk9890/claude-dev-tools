#!/usr/bin/env bash
# test-server.sh — integration tests for plugins/html-visualization/bin/server.js
#
# Tests start the real server and issue real HTTP requests via curl.
# Covers:
#   - GET / returns HTML with CSRF_TOKEN injected
#   - GET /assets/<file> serves an asset
#   - GET /assets/../../<path> returns 404 (path traversal)
#   - POST /submit with valid token + same-origin headers writes feedback + exits 0
#   - POST /submit with missing/wrong token returns 403 and server keeps running
#   - POST /submit passes arbitrary JSON-object fields through verbatim
#   - POST /submit with a non-object JSON body returns 400
#   - POST /submit after already submitted returns 410
#   - Timeout with no submit exits non-zero
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER="$REPO_ROOT/plugins/html-visualization/bin/server.js"
ASSETS_DIR="$REPO_ROOT/plugins/html-visualization/assets"

PASS=0
FAIL=0

# ── Helpers ───────────────────────────────────────────────────────────────────

ok() {
  printf 'PASS: %s\n' "$1"
  PASS=$((PASS + 1))
}

fail() {
  printf 'FAIL: %s\n' "$1"
  FAIL=$((FAIL + 1))
}

# Start the server in the background; set SERVER_PID, BASE_URL, FEEDBACK_FILE.
# Usage: start_server <html-file> [extra args...]
# Registers a trap to kill the server on exit.
start_server() {
  local html_file="$1"
  shift

  local log_file
  log_file=$(mktemp)
  SERVER_LOG="$log_file"

  node "$SERVER" "$html_file" "$@" > "$log_file" 2>&1 &
  SERVER_PID=$!

  # Wait up to 5 seconds for the server to print its URL
  local i
  for i in $(seq 1 100); do
    if grep -q 'URL: http://127.0.0.1:' "$log_file" 2>/dev/null; then
      break
    fi
    sleep 0.05
  done

  if ! grep -q 'URL: http://127.0.0.1:' "$log_file" 2>/dev/null; then
    printf 'ERROR: server did not start within 5s\n'
    printf 'Server log:\n%s\n' "$(cat "$log_file")"
    kill "$SERVER_PID" 2>/dev/null
    return 1
  fi

  BASE_URL=$(grep 'URL: ' "$log_file" | sed 's/.*URL: //' | tr -d '[:space:]')
  # strip trailing slash for easier concatenation
  BASE_URL="${BASE_URL%/}"

  FEEDBACK_FILE=$(grep 'Feedback file: ' "$log_file" | sed 's/.*Feedback file: //' | tr -d '[:space:]')
}

kill_server() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
  if [[ -n "${SERVER_LOG:-}" ]]; then
    rm -f "$SERVER_LOG"
    SERVER_LOG=""
  fi
}

# Make a minimal test HTML file
make_html() {
  local file="$1"
  cat > "$file" <<'EOF'
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><h1>Test page</h1></body>
</html>
EOF
}

# Valid submit payload
valid_payload() {
  printf '{"verdict":"approve","answers":{},"comments":[],"freeform":"looks good"}'
}

# Extract the CSRF token from HTML
extract_token_from_html() {
  local html="$1"
  # Match: const CSRF_TOKEN = "...";
  printf '%s' "$html" | grep -oP 'const CSRF_TOKEN = "\K[^"]+'
}

# ── Test setup / teardown variables ──────────────────────────────────────────

SERVER_PID=""
SERVER_LOG=""
BASE_URL=""
FEEDBACK_FILE=""

# Always kill the server on exit
cleanup() {
  kill_server
}
trap cleanup EXIT

# ── Tests ─────────────────────────────────────────────────────────────────────

# 1. GET / returns 200 and injects CSRF_TOKEN into HTML
test_get_root_token_injection() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local html
  html=$(curl -s "$BASE_URL/")

  kill_server
  rm -f "$tmp_html"

  # Check for const CSRF_TOKEN = "...";
  if ! printf '%s' "$html" | grep -qP 'const CSRF_TOKEN = "[^"]{20,}"'; then
    fail "GET /: CSRF_TOKEN not injected or too short"
    printf '  body snippet: %s\n' "$(printf '%s' "$html" | head -5)"
    return
  fi

  ok "GET /: CSRF_TOKEN injected into HTML"
}

# 2. GET / startup prints URL and feedback file path to stdout
test_startup_output() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local log_content
  log_content=$(cat "$SERVER_LOG")

  kill_server
  rm -f "$tmp_html"

  if ! printf '%s' "$log_content" | grep -q 'URL: http://127.0.0.1:'; then
    fail "startup: URL not printed to stdout"
    return
  fi
  ok "startup: URL printed to stdout"

  if ! printf '%s' "$log_content" | grep -q 'Feedback file:'; then
    fail "startup: Feedback file path not printed to stdout"
    return
  fi
  ok "startup: Feedback file path printed to stdout"
}

# 3. GET /assets/<file> serves a real asset file
test_get_asset() {
  # Create a temporary asset file in the assets dir for this test
  local asset_file="$ASSETS_DIR/test-asset-$$.txt"
  printf 'hello asset\n' > "$asset_file"

  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local status body
  status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/assets/test-asset-$$.txt")
  body=$(curl -s "$BASE_URL/assets/test-asset-$$.txt")

  kill_server
  rm -f "$tmp_html" "$asset_file"

  if [[ "$status" != "200" ]]; then
    fail "GET /assets/<file>: expected 200, got $status"
    return
  fi
  if [[ "$body" != "hello asset" ]]; then
    fail "GET /assets/<file>: expected 'hello asset', got '$body'"
    return
  fi
  ok "GET /assets/<file>: returns 200 with correct body"
}

# 4. GET /assets/../../etc/passwd returns 404 (path traversal)
test_get_asset_path_traversal() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local status
  # Try path traversal via URL-encoded and plain variants
  status=$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "$BASE_URL/assets/../../etc/passwd")

  kill_server
  rm -f "$tmp_html"

  if [[ "$status" != "404" ]]; then
    fail "GET /assets path traversal: expected 404, got $status"
    return
  fi
  ok "GET /assets path traversal: returns 404"
}

# 5. POST /submit with valid token and valid payload writes feedback + server exits 0
test_valid_submit() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  # Get the token from the served HTML
  local html token
  html=$(curl -s "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  if [[ -z "$token" ]]; then
    fail "valid submit: could not extract CSRF_TOKEN from GET /"
    kill_server
    rm -f "$tmp_html"
    return
  fi

  # POST valid submit
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  # Wait for server to exit
  local exit_code=0
  wait "$SERVER_PID" 2>/dev/null || exit_code=$?
  SERVER_PID=""

  rm -f "$tmp_html"

  if [[ "$status" != "200" ]]; then
    fail "valid submit: expected 200, got $status"
    return
  fi
  ok "valid submit: POST /submit returns 200"

  if [[ "$exit_code" != "0" ]]; then
    fail "valid submit: server exit code expected 0, got $exit_code"
    return
  fi
  ok "valid submit: server exits 0 after valid submit"

  # Verify feedback file written
  if [[ ! -f "$FEEDBACK_FILE" ]]; then
    fail "valid submit: feedback file not written at $FEEDBACK_FILE"
    return
  fi
  ok "valid submit: feedback file written"

  # Verify feedback file content
  local verdict answers freeform submitted_at
  verdict=$(python3 -c "import json,sys; d=json.load(open('$FEEDBACK_FILE')); print(d['verdict'])" 2>&1)
  answers=$(python3 -c "import json,sys; d=json.load(open('$FEEDBACK_FILE')); print(d['answers'])" 2>&1)
  freeform=$(python3 -c "import json,sys; d=json.load(open('$FEEDBACK_FILE')); print(d['freeform'])" 2>&1)
  submitted_at=$(python3 -c "import json,sys; d=json.load(open('$FEEDBACK_FILE')); print(d.get('submittedAt','MISSING'))" 2>&1)

  if [[ "$verdict" != "approve" ]]; then
    fail "valid submit: feedback verdict expected 'approve', got '$verdict'"
  else
    ok "valid submit: feedback verdict verbatim"
  fi

  if [[ "$freeform" != "looks good" ]]; then
    fail "valid submit: feedback freeform expected 'looks good', got '$freeform'"
  else
    ok "valid submit: feedback freeform verbatim"
  fi

  if [[ "$submitted_at" == "MISSING" ]]; then
    fail "valid submit: submittedAt missing from feedback file"
  else
    ok "valid submit: submittedAt present in feedback file"
  fi

  rm -f "$FEEDBACK_FILE"
}

# 6. POST /submit with missing token returns 403 and server keeps running
test_missing_token_403() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  if [[ "$status" != "403" ]]; then
    fail "missing token: expected 403, got $status"
    kill_server
    rm -f "$tmp_html"
    return
  fi
  ok "missing token: POST /submit returns 403"

  # Server should still be running (no submit accepted)
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    fail "missing token: server exited after rejected submit (should keep running)"
    SERVER_PID=""
    rm -f "$tmp_html"
    return
  fi
  ok "missing token: server keeps running after rejected submit"

  kill_server
  rm -f "$tmp_html"
}

# 7. POST /submit with wrong token returns 403
test_wrong_token_403() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: wrong-token-value" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  kill_server
  rm -f "$tmp_html"

  if [[ "$status" != "403" ]]; then
    fail "wrong token: expected 403, got $status"
    return
  fi
  ok "wrong token: POST /submit returns 403"
}

# 8. POST /submit with an arbitrary JSON object — server is schema-agnostic, so
#    every field is passed through verbatim and stamped with submittedAt.
test_arbitrary_passthrough() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local html token
  html=$(curl -s "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -d '{"customField":"hello","nested":{"n":42},"list":[1,2]}' \
    "$BASE_URL/submit")

  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""

  rm -f "$tmp_html"

  if [[ "$status" != "200" ]]; then
    fail "arbitrary payload: expected 200, got $status"
    rm -f "${FEEDBACK_FILE:-}" 2>/dev/null
    return
  fi
  ok "arbitrary payload: POST /submit returns 200 for any JSON object"

  if [[ ! -f "$FEEDBACK_FILE" ]]; then
    fail "arbitrary payload: feedback file not written"
    return
  fi

  local custom nested submitted_at
  custom=$(python3 -c "import json; print(json.load(open('$FEEDBACK_FILE'))['customField'])" 2>&1)
  nested=$(python3 -c "import json; print(json.load(open('$FEEDBACK_FILE'))['nested']['n'])" 2>&1)
  submitted_at=$(python3 -c "import json; print(json.load(open('$FEEDBACK_FILE')).get('submittedAt','MISSING'))" 2>&1)

  rm -f "$FEEDBACK_FILE"

  if [[ "$custom" != "hello" || "$nested" != "42" ]]; then
    fail "arbitrary payload: fields not passed through verbatim (customField='$custom', nested.n='$nested')"
    return
  fi
  ok "arbitrary payload: arbitrary fields passed through verbatim"

  if [[ "$submitted_at" == "MISSING" ]]; then
    fail "arbitrary payload: submittedAt not stamped by server"
    return
  fi
  ok "arbitrary payload: server stamps submittedAt"
}

# 9. POST /submit with a non-object JSON body (array) returns 400
test_non_object_body_400() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local html token
  html=$(curl -s "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -d '[1,2,3]' \
    "$BASE_URL/submit")

  kill_server
  rm -f "$tmp_html"

  if [[ "$status" != "400" ]]; then
    fail "non-object body: expected 400, got $status"
    return
  fi
  ok "non-object body: POST /submit returns 400 for a JSON array"
}

# 10. Duplicate POST /submit returns 410
test_duplicate_submit_410() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local html token
  html=$(curl -s "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  # First submit
  local status1
  status1=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  # Immediately try again before server exits (race-aware: try quickly)
  local status2
  status2=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  # Wait for server exit
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""

  rm -f "$tmp_html" "${FEEDBACK_FILE:-}" 2>/dev/null

  if [[ "$status1" != "200" ]]; then
    fail "duplicate submit: first submit expected 200, got $status1"
    return
  fi
  ok "duplicate submit: first POST /submit returns 200"

  # Second submit should be 410 (server accepted and is shutting down) OR
  # connection refused if the server already exited. Either way, not 200.
  if [[ "$status2" == "200" ]]; then
    fail "duplicate submit: second submit unexpectedly returned 200 (should be 410 or connection refused)"
    return
  fi
  if [[ "$status2" == "410" ]]; then
    ok "duplicate submit: second POST /submit returns 410"
  else
    # Connection refused (000) or other is also acceptable — server already exited
    ok "duplicate submit: second POST /submit did not return 200 (got $status2 — server already gone)"
  fi
}

# 11. Timeout exits non-zero
test_timeout_exits_nonzero() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html" --timeout-sec 1

  # Wait for server to exit on timeout
  local exit_code=0
  wait "$SERVER_PID" 2>/dev/null || exit_code=$?
  SERVER_PID=""

  rm -f "$tmp_html"

  if [[ "$exit_code" -eq 0 ]]; then
    fail "timeout: expected non-zero exit, got 0"
    return
  fi
  ok "timeout: server exits non-zero after timeout (exit $exit_code)"
}

# 12. POST /submit with wrong Origin returns 403
test_wrong_origin_403() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local html token
  html=$(curl -s "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -H "Origin: http://evil.example.com" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  kill_server
  rm -f "$tmp_html"

  if [[ "$status" != "403" ]]; then
    fail "wrong origin: expected 403, got $status"
    return
  fi
  ok "wrong origin: POST /submit with wrong Origin returns 403"
}

# 13. POST /submit with Sec-Fetch-Site: cross-site returns 403
test_sec_fetch_cross_site_403() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local html token
  html=$(curl -s "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -H "Sec-Fetch-Site: cross-site" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  kill_server
  rm -f "$tmp_html"

  if [[ "$status" != "403" ]]; then
    fail "cross-site: expected 403, got $status"
    return
  fi
  ok "cross-site Sec-Fetch-Site: POST /submit returns 403"
}

# 14. POST /submit with correct Origin (same as server) returns 200
test_correct_origin_allowed() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local html token
  html=$(curl -s "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  # Extract the exact origin from BASE_URL (http://127.0.0.1:<port>)
  local server_origin
  server_origin=$(printf '%s' "$BASE_URL" | grep -oP 'http://127\.0\.0\.1:\d+')

  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -H "Origin: $server_origin" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""

  rm -f "$tmp_html" "${FEEDBACK_FILE:-}" 2>/dev/null

  if [[ "$status" != "200" ]]; then
    fail "correct origin: expected 200, got $status"
    return
  fi
  ok "correct origin: POST /submit with correct Origin returns 200"
}

# ── Run all tests ─────────────────────────────────────────────────────────────

SERVER_PID=""
SERVER_LOG=""

test_startup_output
test_get_root_token_injection
test_get_asset
test_get_asset_path_traversal
test_valid_submit
test_missing_token_403
test_wrong_token_403
test_arbitrary_passthrough
test_non_object_body_400
test_duplicate_submit_410
test_timeout_exits_nonzero
test_wrong_origin_403
test_sec_fetch_cross_site_403
test_correct_origin_allowed

printf '\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
