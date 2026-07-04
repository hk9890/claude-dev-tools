#!/usr/bin/env bash
# run-all.sh — discover and run all test-*.sh suites in this directory.
#
# Part of the marketplace pseudo-plugin under tests/marketplace so that the
# top-level tests/run-all.sh discovers it via:
#   find tests/ -mindepth 3 -maxdepth 3 -name run-all.sh
#
# Exit codes:
#   0  — all suites passed
#   1  — one or more suites failed
#   77 — no failures, but one or more suites skipped (optional prerequisite absent)

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PASS=0
FAIL=0
SKIP=0

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
  elif [[ "$code" -eq 77 ]]; then
    printf 'SUITE SKIP: %s (optional prerequisite absent)\n' "$name"
    SKIP=$((SKIP + 1))
  else
    printf 'SUITE FAIL: %s (exit %d)\n' "$name" "$code"
    FAIL=$((FAIL + 1))
  fi
done

printf '\n=== run-all summary ===\n'
printf '%d suite(s) passed, %d suite(s) failed, %d suite(s) skipped\n' "$PASS" "$FAIL" "$SKIP"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
elif [[ "$SKIP" -gt 0 ]]; then
  exit 77
fi
