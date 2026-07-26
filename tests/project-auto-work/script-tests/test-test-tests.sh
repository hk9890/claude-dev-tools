#!/usr/bin/env bash
# test-test-tests.sh — unit tests for the pure helpers in
# plugins/project-auto-work/skills/test-tests/workflows/test-tests.js.
#
# Wraps test-test-tests.js (same directory), which loads the workflow script in a sandbox
# and asserts its argument normalization, per-level dials, baseline abort-gate ordering and
# scoreability guard — none of which is otherwise reachable without an audit run that
# mutates production code. Picked up automatically by tests/run-all.sh via:
#   find "$TESTS_DIR" -mindepth 3 -maxdepth 3 -name 'test-*.sh' | sort
#
# Exit codes:
#   0 — all assertions passed
#   1 — one or more assertions failed (or node is unavailable)

set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
NODE_SCRIPT="$REPO_ROOT/tests/project-auto-work/script-tests/test-test-tests.js"

if ! command -v node >/dev/null 2>&1; then
  printf 'FAIL: node is required to test test-tests.js but was not found on PATH\n' >&2
  exit 1
fi

if [[ ! -f "$NODE_SCRIPT" ]]; then
  printf 'FAIL: test-test-tests.js not found at %s\n' "$NODE_SCRIPT"
  exit 1
fi

exec node "$NODE_SCRIPT"
