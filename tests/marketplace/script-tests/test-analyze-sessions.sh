#!/usr/bin/env bash
# test-analyze-sessions.sh — fixture-based regression tests for
# scripts/analyze-sessions.py
#
# Covers:
#   - fixture: running against session-fixture.jsonl exits 0 and produces output
#   - fixture-check: check-fixture.py validates the dataset against expected output
#   - false-positive: a Read tool_result with is_error=false containing the
#     permission-denial magic phrase must NOT increment permission_denials (1un)
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/scripts/analyze-sessions.py"
CHECK_SCRIPT="$REPO_ROOT/scripts/fixtures/check-fixture.py"
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
  local out code=0
  out=$("$@" 2>&1) || code=$?
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

# 1. Script runs against the fixture without error
test_fixture_runs() {
  assert_exit "fixture: analyze-sessions runs without error" 0 \
    python3 "$SCRIPT" \
      --fixture "$FIXTURE" \
      --output-dir "$TMP_DIR/output" \
      --plugins-dir "$REPO_ROOT/plugins"
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

# 4. False-positive guard: the beads-tasks:beads-core episode must have
#    permission_denials=0 even though a Read tool_result in that episode
#    contains the magic phrase "doesn't want to proceed" with is_error=false.
test_false_positive_not_counted() {
  assert_json_field \
    "false-positive: permission_denials=0 for Read result with magic phrase (is_error=false)" \
    "$TMP_DIR/output/fixture/dataset.json" \
    "beads-tasks:beads-core" \
    "permission_denials" \
    "0"
}

# ── run all tests (ordered — later tests depend on earlier output) ────────────

test_fixture_runs
test_fixture_output_exists
test_fixture_check_passes
test_false_positive_not_counted

printf '\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
