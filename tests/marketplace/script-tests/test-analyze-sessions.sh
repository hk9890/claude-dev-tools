#!/usr/bin/env bash
# test-analyze-sessions.sh — fixture-based regression tests for
# scripts/analyze-sessions.py
#
# Covers:
#   - fixture: running against session-fixture.jsonl exits 0 and produces output
#   - fixture-check: check-fixture.py validates the dataset against expected output
#   - false-positive: a Read tool_result with is_error=false containing the
#     permission-denial magic phrase must NOT increment permission_denials (1un)
#   - lvdtq4: a cancelled parallel-batch sibling (is_error=true + "Cancelled:
#     parallel tool call") must NOT increment tool_errors
#   - rzbmhc: episode slice files carry reconstructed conversation events, with
#     credential-like strings redacted by sanitize_text
#   - slices also redact 32+ char hex blobs to [HEX] and truncate event text
#     over --max-slice-chars with a "[truncated N chars]" suffix
#   - the SKILL_RENAME_ALIASES merge is pinned via check-fixture.py's
#     summary-table assertions (canonical rows present, raw aliases absent)
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/scripts/analyze-sessions.py"
CHECK_SCRIPT="$REPO_ROOT/tests/marketplace/script-tests/check-fixture.py"
FIXTURE="$REPO_ROOT/scripts/fixtures/session-fixture.jsonl"
EXPECTED="$REPO_ROOT/scripts/fixtures/session-fixture-expected.json"

PASS=0
FAIL=0

# ── helpers ──────────────────────────────────────────────────────────────────

ok() {
  printf 'PASS: %s\n' "$1"
  PASS=$((PASS + 1))
}

fail() {
  printf 'FAIL: %s\n' "$1"
  FAIL=$((FAIL + 1))
}

assert_exit() {
  local label="$1" expected_code="$2"
  shift 2
  local actual_code=0
  "$@" >/dev/null 2>&1 || actual_code=$?
  if [[ "$actual_code" -eq "$expected_code" ]]; then
    ok "$label (exit $expected_code)"
  else
    fail "$label — expected exit $expected_code, got $actual_code"
  fi
}

assert_output_contains() {
  local label="$1" needle="$2"
  shift 2
  local out
  out=$("$@" 2>&1) || true
  if printf '%s' "$out" | grep -qF "$needle"; then
    ok "$label"
  else
    fail "$label — expected output to contain $(printf '%q' "$needle")"
    printf '  actual output:\n%s\n' "$out"
  fi
}

assert_json_field() {
  # Assert that a field in a JSON file has the expected value.
  # Matches the episode by attribution_skill, then checks the field.
  local label="$1" json_file="$2" skill="$3" field="$4" expected_value="$5"
  local actual_value
  actual_value=$(python3 - <<PYEOF
import json, sys
with open("$json_file") as f:
    episodes = json.load(f)
for ep in episodes:
    if ep.get("attribution_skill") == "$skill":
        val = ep.get("$field")
        print(json.dumps(val))
        sys.exit(0)
print("null")
PYEOF
)
  if [[ "$actual_value" == "$expected_value" ]]; then
    ok "$label"
  else
    fail "$label — expected $expected_value, got $actual_value"
  fi
}

# ── test cases ────────────────────────────────────────────────────────────────

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# 1. Script runs against the fixture without error.
#    --max-slice-chars 400 makes the padded pytest event in episode 3 exceed
#    the cap so the truncation branch of sanitize_text is exercised.
test_fixture_runs() {
  assert_exit "fixture: analyze-sessions runs without error" 0 \
    python3 "$SCRIPT" \
      --fixture "$FIXTURE" \
      --output-dir "$TMP_DIR/output" \
      --plugins-dir "$REPO_ROOT/plugins" \
      --max-slice-chars 400
}

# 2. Output dataset.json is produced
test_fixture_output_exists() {
  if [[ -f "$TMP_DIR/output/fixture/dataset.json" ]]; then
    ok "fixture: dataset.json produced"
  else
    fail "fixture: dataset.json not found at $TMP_DIR/output/fixture/dataset.json"
  fi
}

# 3. check-fixture.py validates the dataset against expected values
test_fixture_check_passes() {
  assert_exit "fixture-check: check-fixture.py passes" 0 \
    python3 "$CHECK_SCRIPT" \
      --actual "$TMP_DIR/output/fixture/dataset.json" \
      --expected "$EXPECTED" \
      --summary "$TMP_DIR/output/fixture/summary.md"
}

# 4. False-positive guard: the tasks:tasks episode must have
#    permission_denials=0 even though a Read tool_result in that episode
#    contains the magic phrase "doesn't want to proceed" with is_error=false.
test_false_positive_not_counted() {
  assert_json_field \
    "false-positive: permission_denials=0 for Read result with magic phrase (is_error=false)" \
    "$TMP_DIR/output/fixture/dataset.json" \
    "tasks:tasks" \
    "permission_denials" \
    "0"
}

# 5. lvdtq4: the cancelled parallel-batch sibling in episode 3 carries
#    is_error=true but must NOT count toward tool_errors (stays 2, not 3).
test_cancelled_not_counted() {
  assert_json_field \
    "lvdtq4: tool_errors=2 for github-releases (cancelled parallel call not counted)" \
    "$TMP_DIR/output/fixture/dataset.json" \
    "github-releases:github-releases" \
    "tool_errors" \
    "2"
}

# 6. rzbmhc: the episode slice carries reconstructed conversation events,
#    not just summary stats.
test_slice_has_content() {
  local slice
  slice=$(ls "$TMP_DIR"/output/fixture/episodes/github-releases*.json 2>/dev/null | head -1)
  if [[ -z "$slice" ]]; then
    fail "rzbmhc: github-releases slice file not found"
    return
  fi
  local result
  result=$(python3 - "$slice" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
events = d.get("events", [])
if not events:
    print("events array empty or missing")
    sys.exit(0)
blob = json.dumps(events)
if "pull request" not in blob and "pytest" not in blob:
    print("events present but missing expected episode content")
    sys.exit(0)
print("OK")
PYEOF
)
  if [[ "$result" == "OK" ]]; then
    ok "rzbmhc: github-releases slice contains reconstructed content events"
  else
    fail "rzbmhc: slice content — $result"
  fi
}

# 7. rzbmhc: sanitize_text is applied to slice content — the fake secret token
#    must be redacted, never written verbatim.
test_slice_redacts_credentials() {
  local slice
  slice=$(ls "$TMP_DIR"/output/fixture/episodes/github-releases*.json 2>/dev/null | head -1)
  if [[ -z "$slice" ]]; then
    fail "rzbmhc: github-releases slice file not found (redaction)"
    return
  fi
  if grep -q "ABCD1234SECRETKEY99" "$slice"; then
    fail "rzbmhc: slice leaked the raw secret token"
  elif grep -q "REDACTED" "$slice"; then
    ok "rzbmhc: slice redacts credential-like strings (sanitize_text active)"
  else
    fail "rzbmhc: slice neither leaked nor redacted the secret — sanitizer not applied?"
  fi
}

# 8. Long hex blobs (32+ chars) in slice content must be redacted to [HEX].
test_slice_redacts_long_hex() {
  local slice
  slice=$(ls "$TMP_DIR"/output/fixture/episodes/github-releases_github-releases*.json 2>/dev/null | head -1)
  if [[ -z "$slice" ]]; then
    fail "hex redaction: github-releases slice file not found"
    return
  fi
  if grep -q "0123456789abcdef0123456789abcdef" "$slice"; then
    fail "hex redaction: slice leaked the raw 32-char hex blob"
  elif grep -qF "[HEX]" "$slice"; then
    ok "hex redaction: slice redacts 32+ char hex blobs to [HEX]"
  else
    fail "hex redaction: slice neither leaked nor redacted the hex blob — LONG_HEX_RE not applied?"
  fi
}

# 9. Event text over --max-slice-chars must carry the truncation suffix.
test_slice_truncates_long_text() {
  local slice
  slice=$(ls "$TMP_DIR"/output/fixture/episodes/github-releases_github-releases*.json 2>/dev/null | head -1)
  if [[ -z "$slice" ]]; then
    fail "truncation: github-releases slice file not found"
    return
  fi
  if grep -qE '\[truncated [0-9]+ chars\]' "$slice"; then
    ok "truncation: slice event over --max-slice-chars carries the [truncated N chars] suffix"
  else
    fail "truncation: no [truncated N chars] suffix found — truncation branch not applied"
  fi
}

# ── run all tests (ordered — later tests depend on earlier output) ────────────

test_fixture_runs
test_fixture_output_exists
test_fixture_check_passes
test_false_positive_not_counted
test_cancelled_not_counted
test_slice_has_content
test_slice_redacts_credentials
test_slice_redacts_long_hex
test_slice_truncates_long_text

printf '\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
