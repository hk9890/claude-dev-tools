#!/usr/bin/env bash
# test-work.sh — unit tests for the pure helpers in plugins/tasks/workflows/work.js.
#
# Wraps test-work.js (same directory), which loads work.js in a sandbox and asserts
# the arg-normalization and action-bucketing logic. Picked up automatically by
# tests/run-all.sh via:
#   find "$TESTS_DIR" -mindepth 3 -maxdepth 3 -name 'test-*.sh' | sort
#
# Exit codes:
#   0 — all assertions passed
#   1 — one or more assertions failed (or node is unavailable)

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="$TESTS_DIR/test-work.js"

if ! command -v node >/dev/null 2>&1; then
  printf 'FAIL: node is required to test work.js but was not found on PATH\n' >&2
  exit 1
fi

if [[ ! -f "$NODE_SCRIPT" ]]; then
  printf 'FAIL: test-work.js not found at %s\n' "$NODE_SCRIPT"
  exit 1
fi

exec node "$NODE_SCRIPT"
