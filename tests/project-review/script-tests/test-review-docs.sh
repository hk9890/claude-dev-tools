#!/usr/bin/env bash
# test-review-docs.sh — unit tests for the pure helpers in
# plugins/project-review/skills/project-review-docs/workflows/review-docs.js.
#
# Wraps test-review-docs.js (same directory), which loads the workflow script in a sandbox
# and asserts its argument normalization, manifest parsing and route dedupe/cap. Picked up
# automatically by tests/run-all.sh via:
#   find "$TESTS_DIR" -mindepth 3 -maxdepth 3 -name 'test-*.sh' | sort
#
# Exit codes:
#   0 — all assertions passed
#   1 — one or more assertions failed (or node is unavailable)

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
NODE_SCRIPT="$REPO_ROOT/tests/project-review/script-tests/test-review-docs.js"

if ! command -v node >/dev/null 2>&1; then
  printf 'FAIL: node is required to test review-docs.js but was not found on PATH\n' >&2
  exit 1
fi

if [[ ! -f "$NODE_SCRIPT" ]]; then
  printf 'FAIL: test-review-docs.js not found at %s\n' "$NODE_SCRIPT"
  exit 1
fi

exec node "$NODE_SCRIPT"
