#!/usr/bin/env bash
# run-all.sh — discover and run all script-tests/test-*.sh in lexical order.
#
# Usage: run-all.sh
#
# Runs every test-*.sh found in the same directory, prints per-test pass/fail,
# and exits non-zero if any test script exits non-zero.
#
# Exit codes:
#   0 — all tests passed
#   1 — one or more tests failed

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PASS=0
FAIL=0

mapfile -t TEST_SCRIPTS < <(find "$TESTS_DIR" -maxdepth 1 -name 'test-*.sh' | sort)

if [[ "${#TEST_SCRIPTS[@]}" -eq 0 ]]; then
  printf 'No test-*.sh files found in %s\n' "$TESTS_DIR"
  exit 0
fi

for test_script in "${TEST_SCRIPTS[@]}"; do
  name="$(basename "$test_script")"
  printf '\n=== %s ===\n' "$name"
  code=0
  bash "$test_script" || code=$?
  if [[ "$code" -eq 0 ]]; then
    printf 'SUITE PASS: %s\n' "$name"
    PASS=$((PASS + 1))
  else
    printf 'SUITE FAIL: %s (exit %d)\n' "$name" "$code"
    FAIL=$((FAIL + 1))
  fi
done

printf '\n=== run-all summary ===\n'
printf '%d suite(s) passed, %d suite(s) failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
