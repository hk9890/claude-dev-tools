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
#   - --no-wait: URL printed but no Feedback file line
#   - --no-wait: empty/missing freeform submit → 200, exit 0, no feedback file (silent close)
#   - --no-wait: non-empty freeform submit → 200, exit 0, feedback file written
#   - --no-wait --timeout-sec N: server exits 0 on timeout
#   - startup URL names the machine hostname; server answers on a non-loopback address
#   - the printed URL is fetchable as printed (skipped where the hostname does not resolve)
#   - Origin is validated against the request's Host header, not a fixed loopback origin
#   - an https Origin matching the Host is accepted (TLS-terminating forwarders)
#   - an Origin naming a different host is still rejected
#   - a submit whose Host is not a name this machine answers as is refused (DNS rebinding)
#   - localhost, 127.0.0.1, the machine hostname and its interface addresses are allow-listed
#   - --host adds a name to the allow-list; an unparseable value fails at startup
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SERVER="$REPO_ROOT/plugins/html-visualization/bin/server.js"
ASSETS_DIR="$REPO_ROOT/plugins/html-visualization/assets"

PASS=0
FAIL=0
SKIP=0

# ── Helpers ───────────────────────────────────────────────────────────────────

ok() {
  printf 'PASS: %s\n' "$1"
  PASS=$((PASS + 1))
}

fail() {
  printf 'FAIL: %s\n' "$1"
  FAIL=$((FAIL + 1))
}

# A test that could not run here. Counted separately — booking it as a PASS
# would let the assertion silently disappear on machines that cannot run it,
# which is exactly where a regression would then slip through.
skip() {
  printf 'SKIP: %s\n' "$1"
  SKIP=$((SKIP + 1))
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
  for _ in $(seq 1 100); do
    if grep -qE 'URL: http://[^/]+:[0-9]+/' "$log_file" 2>/dev/null; then
      break
    fi
    sleep 0.05
  done

  if ! grep -qE 'URL: http://[^/]+:[0-9]+/' "$log_file" 2>/dev/null; then
    printf 'ERROR: server did not start within 5s\n'
    printf 'Server log:\n%s\n' "$(cat "$log_file")"
    kill "$SERVER_PID" 2>/dev/null
    return 1
  fi

  PRINTED_URL=$(grep 'URL: ' "$log_file" | sed 's/.*URL: //' | tr -d '[:space:]')
  SERVER_PORT="${PRINTED_URL##*:}"
  SERVER_PORT="${SERVER_PORT%/}"
  # The printed URL names the machine's own hostname, since the server binds all
  # interfaces. Drive the requests over loopback anyway: whether that hostname
  # resolves is a property of the environment running the tests, not of the
  # server. Test 2 asserts the printed line separately.
  BASE_URL="http://127.0.0.1:${SERVER_PORT}"

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
PRINTED_URL=""
SERVER_PORT=""

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

  # The URL must name the machine's own hostname, not loopback — that is the
  # link the user clicks, and it has to work from another machine.
  local expected_host
  expected_host=$(node -e 'process.stdout.write(require("os").hostname())')

  # -F, not -E: a hostname is not a regex. An ERE metacharacter in it (`runner+1`)
  # would stop the pattern matching the line it was built from, and the dots in
  # an FQDN would quietly match anything.
  if ! printf '%s' "$log_content" | grep -qF "URL: http://${expected_host}:"; then
    fail "startup: URL not printed with the machine hostname ($expected_host)"
    return
  fi
  ok "startup: URL printed to stdout under the machine hostname"

  if ! printf '%s' "$log_content" | grep -q 'Feedback file:'; then
    fail "startup: Feedback file path not printed to stdout"
    return
  fi
  ok "startup: Feedback file path printed to stdout"
}

# 3. GET /assets/<file> serves a committed asset file. Fetches assets that
#    ship with the plugin instead of writing a fixture into the tracked tree —
#    the test must never mutate plugins/.
#
#    Every shared asset is fetched: they are referenced only from generated
#    pages, so a rename or a mistyped path in one of them has no other way to
#    surface before a user hits the broken page.
test_get_asset() {
  local shared_assets=(shared/tokens.css shared/chrome.css shared/submit.js)

  local asset_rel
  for asset_rel in "${shared_assets[@]}"; do
    if [[ ! -f "$ASSETS_DIR/$asset_rel" ]]; then
      fail "GET /assets/<file>: committed asset $asset_rel missing under $ASSETS_DIR"
      return
    fi
  done

  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  if ! start_server "$tmp_html"; then
    fail "GET /assets/<file>: server did not start"
    rm -f "$tmp_html"
    return
  fi

  local tmp_body
  tmp_body=$(mktemp)

  for asset_rel in "${shared_assets[@]}"; do
    local status
    status=$(curl -s -o "$tmp_body" -w '%{http_code}' "$BASE_URL/assets/$asset_rel")

    if [[ "$status" != "200" ]]; then
      fail "GET /assets/$asset_rel: expected 200, got $status"
      continue
    fi
    if ! cmp -s "$tmp_body" "$ASSETS_DIR/$asset_rel"; then
      fail "GET /assets/$asset_rel: response body does not match the file on disk"
      continue
    fi
    ok "GET /assets/$asset_rel: returns 200 with the committed asset's exact content"
  done

  kill_server
  rm -f "$tmp_html" "$tmp_body"
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
  local verdict freeform submitted_at
  verdict=$(python3 -c "import json,sys; d=json.load(open('$FEEDBACK_FILE')); print(d['verdict'])" 2>&1)
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

  # The origin the browser would send when it addressed the server this way.
  local server_origin="$BASE_URL"

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

# 15. --no-wait: startup prints URL but NOT a "Feedback file:" line
test_no_wait_no_feedback_line() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html" --no-wait

  local log_content
  log_content=$(cat "$SERVER_LOG")

  kill_server
  rm -f "$tmp_html"

  if ! printf '%s' "$log_content" | grep -qE 'URL: http://[^/]+:[0-9]+/'; then
    fail "no-wait startup: URL not printed to stdout"
    return
  fi
  ok "no-wait startup: URL printed to stdout"

  if printf '%s' "$log_content" | grep -q 'Feedback file:'; then
    fail "no-wait startup: Feedback file line should NOT be printed in --no-wait mode"
    return
  fi
  ok "no-wait startup: Feedback file line not printed in --no-wait mode"
}

# 16. --no-wait: empty/missing freeform submit → 200, exit 0, no feedback file written
test_no_wait_empty_close_exits_zero_no_file() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html" --no-wait

  # Get the token from the served HTML
  local html token
  html=$(curl -s "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  if [[ -z "$token" ]]; then
    fail "no-wait empty close: could not extract CSRF_TOKEN from GET /"
    kill_server
    rm -f "$tmp_html"
    return
  fi

  # Compute expected feedback file path manually (server doesn't print it in --no-wait)
  local html_base html_dir expected_feedback
  html_base="$(basename "$tmp_html" .html)"
  html_dir="$(dirname "$tmp_html")"
  expected_feedback="$html_dir/${html_base}.feedback.json"

  # POST with empty freeform (silent close)
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -d '{"freeform":""}' \
    "$BASE_URL/submit")

  # Wait for server to exit
  local exit_code=0
  wait "$SERVER_PID" 2>/dev/null || exit_code=$?
  SERVER_PID=""

  rm -f "$tmp_html"

  if [[ "$status" != "200" ]]; then
    fail "no-wait empty close: expected 200, got $status"
    return
  fi
  ok "no-wait empty close: POST /submit returns 200"

  if [[ "$exit_code" -ne 0 ]]; then
    fail "no-wait empty close: expected exit 0, got $exit_code"
    return
  fi
  ok "no-wait empty close: server exits 0"

  if [[ -f "$expected_feedback" ]]; then
    fail "no-wait empty close: feedback file should NOT be written, but found $expected_feedback"
    rm -f "$expected_feedback"
    return
  fi
  ok "no-wait empty close: no feedback file written"
}

# 16b. --no-wait: non-empty freeform submit → 200, exit 0, feedback file written
test_no_wait_nonempty_submit_writes_feedback() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html" --no-wait

  # Get the token from the served HTML
  local html token
  html=$(curl -s "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  if [[ -z "$token" ]]; then
    fail "no-wait non-empty submit: could not extract CSRF_TOKEN from GET /"
    kill_server
    rm -f "$tmp_html"
    return
  fi

  # Compute expected feedback file path manually (server doesn't print it in --no-wait)
  local html_base html_dir expected_feedback
  html_base="$(basename "$tmp_html" .html)"
  html_dir="$(dirname "$tmp_html")"
  expected_feedback="$html_dir/${html_base}.feedback.json"

  # POST with non-empty freeform
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -d '{"freeform":"Great visualization, please add a legend."}' \
    "$BASE_URL/submit")

  # Wait for server to exit
  local exit_code=0
  wait "$SERVER_PID" 2>/dev/null || exit_code=$?
  SERVER_PID=""

  rm -f "$tmp_html"

  if [[ "$status" != "200" ]]; then
    fail "no-wait non-empty submit: expected 200, got $status"
    rm -f "$expected_feedback" 2>/dev/null
    return
  fi
  ok "no-wait non-empty submit: POST /submit returns 200"

  if [[ "$exit_code" -ne 0 ]]; then
    fail "no-wait non-empty submit: expected exit 0, got $exit_code"
    rm -f "$expected_feedback" 2>/dev/null
    return
  fi
  ok "no-wait non-empty submit: server exits 0"

  if [[ ! -f "$expected_feedback" ]]; then
    fail "no-wait non-empty submit: feedback file not written at $expected_feedback"
    return
  fi
  ok "no-wait non-empty submit: feedback file written"

  # Verify feedback file content
  local freeform submitted_at
  freeform=$(python3 -c "import json; print(json.load(open('$expected_feedback'))['freeform'])" 2>&1)
  submitted_at=$(python3 -c "import json; print(json.load(open('$expected_feedback')).get('submittedAt','MISSING'))" 2>&1)

  rm -f "$expected_feedback"

  if [[ "$freeform" != "Great visualization, please add a legend." ]]; then
    fail "no-wait non-empty submit: feedback freeform expected message, got '$freeform'"
    return
  fi
  ok "no-wait non-empty submit: freeform value verbatim in feedback file"

  if [[ "$submitted_at" == "MISSING" ]]; then
    fail "no-wait non-empty submit: submittedAt missing from feedback file"
    return
  fi
  ok "no-wait non-empty submit: submittedAt present in feedback file"
}

# 17. --no-wait --timeout-sec 1: server exits with code 0 on timeout
test_no_wait_timeout_exits_zero() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html" --no-wait --timeout-sec 1

  local exit_code=0
  wait "$SERVER_PID" 2>/dev/null || exit_code=$?
  SERVER_PID=""

  rm -f "$tmp_html"

  if [[ "$exit_code" -ne 0 ]]; then
    fail "no-wait timeout: expected exit 0, got $exit_code"
    return
  fi
  ok "no-wait timeout: server exits 0 after timeout (exit $exit_code)"
}

# 18. The server is reachable on a non-loopback address (all-interfaces bind).
#     This is what makes the page openable from another machine over SSH; a
#     regression to a 127.0.0.1 bind would still pass every other test here.
test_binds_all_interfaces() {
  local lan_ip
  lan_ip=$(node -e '
    const nets = require("os").networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const n of list || []) {
        if (n.family === "IPv4" && !n.internal) { process.stdout.write(n.address); process.exit(0); }
      }
    }
  ')

  if [[ -z "$lan_ip" ]]; then
    skip "bind: no non-loopback IPv4 interface on this machine"
    return
  fi

  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  # --max-time: a host firewall that DROPs traffic to its own LAN address would
  # otherwise stall on curl's full connect timeout before failing the gate.
  local status
  status=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "http://${lan_ip}:${SERVER_PORT}/")

  kill_server
  rm -f "$tmp_html"

  if [[ "$status" != "200" ]]; then
    fail "bind: GET / on $lan_ip:$SERVER_PORT expected 200, got $status"
    return
  fi
  ok "bind: server answers on non-loopback address $lan_ip"
}

# 19. Origin is validated against the request's own Host header, not a fixed
#     loopback origin — otherwise every submit from a page opened by DNS name
#     would 403.
test_origin_matches_host_header() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  # Bounded lifetime: only a 200 makes the server exit on its own, so if this
  # check ever regresses to a 403 the wait below must still terminate. Without
  # it a failing assertion would hang run-all.sh for the 1800s default instead
  # of reporting the regression this test exists to catch.
  #
  # --host: devbox.example is not a name this machine answers as, so the Host
  # allow-list refuses it by default. Allow-listing it is what puts this test
  # back on the Origin check it exists to exercise.
  start_server "$tmp_html" --timeout-sec 10 --host devbox.example

  local html token
  html=$(curl -s --max-time 10 "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  # Address the server under a name that is not loopback, as a remote browser
  # would. Origin agrees with that Host, so this is same-origin and must pass.
  local remote_host="devbox.example:${SERVER_PORT}"

  local status
  status=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Host: $remote_host" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -H "Origin: http://$remote_host" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""

  rm -f "$tmp_html" "${FEEDBACK_FILE:-}" 2>/dev/null

  if [[ "$status" != "200" ]]; then
    fail "host-relative origin: expected 200 for Origin matching Host, got $status"
    return
  fi
  ok "host-relative origin: Origin matching a non-loopback Host returns 200"
}

# 20. The URL the server prints is fetchable as printed. Every other test drives
#     loopback, so without this nothing ever exercises the one string the user
#     is actually handed.
test_printed_url_is_fetchable() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local host="${PRINTED_URL#http://}"
  host="${host%%:*}"

  # Whether the machine's own hostname resolves is a property of this
  # environment (a container ID resolves nowhere). Skip rather than fail — but
  # skip visibly, so nobody reads a green run as proof the link works.
  if ! node -e 'require("dns").lookup(process.argv[1], e => process.exit(e ? 1 : 0))' "$host" 2>/dev/null; then
    kill_server
    rm -f "$tmp_html"
    skip "printed URL: hostname '$host' does not resolve in this environment"
    return
  fi

  local status
  status=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "$PRINTED_URL")

  kill_server
  rm -f "$tmp_html"

  if [[ "$status" != "200" ]]; then
    fail "printed URL: GET $PRINTED_URL expected 200, got $status"
    return
  fi
  ok "printed URL: the advertised link serves the page as printed"
}

# 21. An https Origin whose host matches the Host header is accepted. A
#     TLS-terminating forwarder (Codespaces, VS Code forwarded ports, Tailscale
#     Serve, ngrok) shows the browser an https page while this server speaks
#     http; comparing whole origins instead of hosts would 403 every submit
#     made through one.
test_tls_forwarder_origin_allowed() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  local fwd_host="myrepo-8080.app.github.dev"

  # A forwarder's public host is not derivable from this machine, so it reaches
  # the allow-list only via --host. That is the documented cost of the pin.
  start_server "$tmp_html" --timeout-sec 10 --host "$fwd_host"

  local html token
  html=$(curl -s --max-time 10 "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  local status
  status=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Host: $fwd_host" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -H "Origin: https://$fwd_host" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""

  rm -f "$tmp_html" "${FEEDBACK_FILE:-}" 2>/dev/null

  if [[ "$status" != "200" ]]; then
    fail "tls forwarder: expected 200 for https Origin matching Host, got $status"
    return
  fi
  ok "tls forwarder: https Origin matching Host returns 200"
}

# 22. A foreign Origin is still rejected when the scheme matches the host's —
#     the host comparison must not have widened into accepting anything.
test_foreign_origin_still_rejected_with_host() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  # Allow-list the Host so the 403 this asserts can only come from the Origin
  # comparison. Without it the Host pin would reject first and the test would
  # pass without ever reaching the check it names.
  start_server "$tmp_html" --host devbox.example

  local html token
  html=$(curl -s --max-time 10 "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  local status
  status=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Host: devbox.example:${SERVER_PORT}" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -H "Origin: https://evil.example.com" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  kill_server
  rm -f "$tmp_html"

  if [[ "$status" != "403" ]]; then
    fail "foreign origin vs host: expected 403, got $status"
    return
  fi
  ok "foreign origin vs host: Origin naming another host returns 403"
}

# 23. A submit addressed to a host this machine does not answer as is refused,
#     even though every other check passes. This is the DNS-rebinding shape: the
#     browser believes it is same-origin, so Origin agrees with Host and
#     Sec-Fetch-Site says same-origin. Only the Host pin can tell them apart.
test_rebound_host_rejected() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  start_server "$tmp_html"

  local html token
  html=$(curl -s --max-time 10 "$BASE_URL/")
  token=$(extract_token_from_html "$html")

  local rebound_host="attacker.example:${SERVER_PORT}"

  local status
  status=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Host: $rebound_host" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $token" \
    -H "Origin: http://$rebound_host" \
    -H "Sec-Fetch-Site: same-origin" \
    -d "$(valid_payload)" \
    "$BASE_URL/submit")

  if [[ "$status" != "403" ]]; then
    fail "rebound host: expected 403 for an unlisted Host, got $status"
    kill_server
    rm -f "$tmp_html" "${FEEDBACK_FILE:-}" 2>/dev/null
    return
  fi
  ok "rebound host: unlisted Host returns 403 despite a matching Origin"

  # A refused submit must not consume the one-shot: the real user still has to
  # be able to submit afterwards.
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    fail "rebound host: server exited after a refused submit (should keep running)"
    SERVER_PID=""
    rm -f "$tmp_html"
    return
  fi
  ok "rebound host: server keeps running after a refused submit"

  if [[ -f "$FEEDBACK_FILE" ]]; then
    fail "rebound host: feedback file written for a refused submit"
    rm -f "$FEEDBACK_FILE"
  else
    ok "rebound host: no feedback file written for a refused submit"
  fi

  kill_server
  rm -f "$tmp_html"
}

# 24. The default allow-list carries the names a local browser actually uses.
#     Each is asserted on its own server so a single accepted submit does not
#     end the run for the others.
test_default_hosts_allowed() {
  local lan_ip
  lan_ip=$(node -e '
    const nets = require("os").networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const n of list || []) {
        if (n.family === "IPv4" && !n.internal) { process.stdout.write(n.address); process.exit(0); }
      }
    }
  ')

  # '[::1]' is bracketed because that is the only form a Host header carries an
  # IPv6 literal in — and the only form the allow-list can be seeded with. Sent
  # as a header over the loopback IPv4 connection, so it asserts the allow-list
  # entry without requiring IPv6 connectivity here.
  local hosts=(localhost 127.0.0.1 '[::1]')
  hosts+=("$(node -e 'process.stdout.write(require("os").hostname())')")
  if [[ -n "$lan_ip" ]]; then
    hosts+=("$lan_ip")
  else
    skip "default hosts: no non-loopback IPv4 interface to check"
  fi

  local host_name
  for host_name in "${hosts[@]}"; do
    local tmp_html
    tmp_html=$(mktemp --suffix=.html)
    make_html "$tmp_html"

    start_server "$tmp_html" --timeout-sec 10

    local html token
    html=$(curl -s --max-time 10 "$BASE_URL/")
    token=$(extract_token_from_html "$html")

    local status
    status=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' \
      -X POST \
      -H "Host: ${host_name}:${SERVER_PORT}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $token" \
      -H "Origin: http://${host_name}:${SERVER_PORT}" \
      -d "$(valid_payload)" \
      "$BASE_URL/submit")

    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
    rm -f "$tmp_html" "${FEEDBACK_FILE:-}" 2>/dev/null

    if [[ "$status" != "200" ]]; then
      fail "default hosts: Host '$host_name' expected 200, got $status"
      continue
    fi
    ok "default hosts: '$host_name' is on the allow-list"
  done
}

# 25. A --host value that is not a hostname is a typo the user must see now, not
#     as a 403 at submit time.
test_invalid_host_flag_exits_nonzero() {
  local tmp_html
  tmp_html=$(mktemp --suffix=.html)
  make_html "$tmp_html"

  local output exit_code=0
  output=$(node "$SERVER" "$tmp_html" --host 'not a host' 2>&1) || exit_code=$?

  rm -f "$tmp_html"

  if [[ "$exit_code" -eq 0 ]]; then
    fail "invalid --host: expected non-zero exit, got 0"
    return
  fi
  ok "invalid --host: server exits non-zero at startup"

  if ! printf '%s' "$output" | grep -q -- '--host'; then
    fail "invalid --host: error message does not name --host (got: $output)"
    return
  fi
  ok "invalid --host: error message names the offending flag"
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
test_no_wait_no_feedback_line
test_no_wait_empty_close_exits_zero_no_file
test_no_wait_nonempty_submit_writes_feedback
test_no_wait_timeout_exits_zero
test_binds_all_interfaces
test_origin_matches_host_header
test_printed_url_is_fetchable
test_tls_forwarder_origin_allowed
test_foreign_origin_still_rejected_with_host
test_rebound_host_rejected
test_default_hosts_allowed
test_invalid_host_flag_exits_nonzero

printf '\n'
printf 'Results: %d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"

[[ "$FAIL" -eq 0 ]] || exit 1
