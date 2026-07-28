#!/usr/bin/env bash
# test-test-app.sh — unit tests for the pure helpers and loop control flow in
# plugins/project-auto-work/skills/test-app/workflows/test-app.js.
#
# Wraps test-test-app.js (same directory), which loads the workflow script in a sandbox and
# asserts its argument normalization, per-level dials, recon abort-gate ordering, batch
# planning, and the drive/analyse loop driven through stubbed agent hooks — none of which is
# otherwise reachable without a real run that launches the user's application and uses it
# against live data. Picked up automatically by tests/run-all.sh via:
#   find "$TESTS_DIR" -mindepth 3 -maxdepth 3 -name 'test-*.sh' | sort
#
# Exit codes:
#   0 — all assertions passed
#   1 — one or more assertions failed (or node is unavailable)

set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
NODE_SCRIPT="$REPO_ROOT/tests/project-auto-work/script-tests/test-test-app.js"

if ! command -v node >/dev/null 2>&1; then
  printf 'FAIL: node is required to test test-app.js but was not found on PATH\n' >&2
  exit 1
fi

if [[ ! -f "$NODE_SCRIPT" ]]; then
  printf 'FAIL: test-test-app.js not found at %s\n' "$NODE_SCRIPT"
  exit 1
fi

exec node "$NODE_SCRIPT"
