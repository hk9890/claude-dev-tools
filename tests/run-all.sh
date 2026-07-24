#!/usr/bin/env bash
# run-all.sh — the marketplace test runner.
#
# Discovers every suite at tests/<plugin>/script-tests/test-*.sh and runs it,
# classifying exit codes in one place.
#
# Usage:
#   tests/run-all.sh                     # every plugin
#   tests/run-all.sh html-visualization   # one plugin
#
# A suite exits 0 on pass, 1 on failure, 77 to skip (optional prerequisite absent).
#
# Exit codes:
#   0 — no suite failed (skipped suites are reported in the summary, not failures)
#   1 — one or more suites failed, or the named plugin has no suites

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN="${1:-}"

PASS=0
FAIL=0
SKIP=0

if [[ -n "$PLUGIN" ]]; then
  mapfile -t TEST_SCRIPTS < <(find "$TESTS_DIR/$PLUGIN" -mindepth 2 -maxdepth 2 -name 'test-*.sh' 2>/dev/null | sort)
  if [[ "${#TEST_SCRIPTS[@]}" -eq 0 ]]; then
    printf 'No suites found for plugin %s (expected %s)\n' \
      "$PLUGIN" "$TESTS_DIR/$PLUGIN/script-tests/test-*.sh"
    exit 1
  fi
else
  mapfile -t TEST_SCRIPTS < <(find "$TESTS_DIR" -mindepth 3 -maxdepth 3 -name 'test-*.sh' | sort)
  if [[ "${#TEST_SCRIPTS[@]}" -eq 0 ]]; then
    printf 'No test-*.sh suites found under %s\n' "$TESTS_DIR"
    exit 0
  fi
fi

CURRENT_PLUGIN=""

for test_script in "${TEST_SCRIPTS[@]}"; do
  plugin="$(basename "$(dirname "$(dirname "$test_script")")")"
  if [[ "$plugin" != "$CURRENT_PLUGIN" ]]; then
    printf '\n########## %s ##########\n' "$plugin"
    CURRENT_PLUGIN="$plugin"
  fi

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

printf '\n========== marketplace test summary ==========\n'
printf '%d suite(s) passed, %d suite(s) failed, %d suite(s) skipped\n' "$PASS" "$FAIL" "$SKIP"

[[ "$FAIL" -eq 0 ]] || exit 1
