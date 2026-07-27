#!/usr/bin/env bash
# test-review-codebase.sh — unit tests for the pure helpers in
# plugins/project-review/skills/project-review-codebase/workflows/review-codebase.js.
#
# Wraps test-review-codebase.js (same directory), which loads the workflow script in a
# sandbox and asserts its argument normalization, schema builder, dimension assembly and
# missing-dimension detection. Picked up automatically by tests/run-all.sh via:
#   find "$TESTS_DIR" -mindepth 3 -maxdepth 3 -name 'test-*.sh' | sort
#
# Exit codes:
#   0 — all assertions passed
#   1 — one or more assertions failed (or node is unavailable)

set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
NODE_SCRIPT="$REPO_ROOT/tests/project-review/script-tests/test-review-codebase.js"

if ! command -v node >/dev/null 2>&1; then
  printf 'FAIL: node is required to test review-codebase.js but was not found on PATH\n' >&2
  exit 1
fi

if [[ ! -f "$NODE_SCRIPT" ]]; then
  printf 'FAIL: test-review-codebase.js not found at %s\n' "$NODE_SCRIPT"
  exit 1
fi

exec node "$NODE_SCRIPT"
