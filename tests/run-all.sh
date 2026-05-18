#!/usr/bin/env bash
# run-all.sh — top-level test runner for all plugins in this marketplace.
#
# Discovers tests/<plugin>/script-tests/run-all.sh for every plugin and runs
# each, aggregating exit codes.
#
# Usage: tests/run-all.sh
#
# Exit codes:
#   0 — all per-plugin runners passed (or there were no tests)
#   1 — one or more per-plugin runners failed

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PASS=0
FAIL=0
SKIP=0

mapfile -t RUNNERS < <(find "$TESTS_DIR" -mindepth 3 -maxdepth 3 -name 'run-all.sh' | sort)

if [[ "${#RUNNERS[@]}" -eq 0 ]]; then
  printf 'No per-plugin run-all.sh found under %s\n' "$TESTS_DIR"
  exit 0
fi

for runner in "${RUNNERS[@]}"; do
  plugin="$(basename "$(dirname "$(dirname "$runner")")")"
  printf '\n########## %s ##########\n' "$plugin"
  code=0
  bash "$runner" || code=$?
  if [[ "$code" -eq 0 ]]; then
    printf 'PLUGIN PASS: %s\n' "$plugin"
    PASS=$((PASS + 1))
  else
    printf 'PLUGIN FAIL: %s (exit %d)\n' "$plugin" "$code"
    FAIL=$((FAIL + 1))
  fi
done

printf '\n========== marketplace test summary ==========\n'
printf '%d plugin(s) passed, %d plugin(s) failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"

[[ "$FAIL" -eq 0 ]] || exit 1
