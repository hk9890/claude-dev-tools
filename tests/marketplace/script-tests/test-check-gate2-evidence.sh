#!/usr/bin/env bash
# test-check-gate2-evidence.sh — smoke tests for scripts/check-gate2-evidence.sh
#
# Coverage:
#   - empty range (HEAD..HEAD): exits 0 and prints PASS
#   - HEAD as base ref: exits 0 because no merge commits exist in HEAD..HEAD
#   - script is executable and runnable
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/scripts/check-gate2-evidence.sh"

PASS=0
FAIL=0

# ── helpers ───────────────────────────────────────────────────────────────────

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

# ── tests ─────────────────────────────────────────────────────────────────────

# 1. Script exists and is executable
test_script_exists() {
  if [[ -x "$SCRIPT" ]]; then
    ok "script is present and executable"
  else
    fail "script missing or not executable: $SCRIPT"
  fi
}

# 2. Empty range exits 0 (HEAD..HEAD contains no merge commits)
test_empty_range_exits_0() {
  assert_exit "empty range (HEAD..HEAD): exits 0" 0 \
    bash "$SCRIPT" HEAD
}

# 3. Empty range output says PASS
test_empty_range_output_pass() {
  assert_output_contains "empty range: output contains PASS" "PASS" \
    bash "$SCRIPT" HEAD
}

# 4. Empty range output says "no merge commits" (informational)
test_empty_range_no_merges_message() {
  assert_output_contains "empty range: mentions no merge commits" "No merge commits" \
    bash "$SCRIPT" HEAD
}

# ── run ───────────────────────────────────────────────────────────────────────

test_script_exists
test_empty_range_exits_0
test_empty_range_output_pass
test_empty_range_no_merges_message

printf '\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
