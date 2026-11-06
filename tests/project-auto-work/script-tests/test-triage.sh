#!/usr/bin/env bash
# test-triage.sh — unit tests for plugins/project-auto-work/workflows/triage.js.
# Wraps test-triage.js (same directory).
#
# Exit codes:
#   0 — all assertions passed
#   1 — one or more assertions failed (or node is unavailable)

set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  printf 'FAIL: node is required to test triage.js but was not found on PATH\n' >&2
  exit 1
fi

exec node "$REPO_ROOT/tests/project-auto-work/script-tests/test-triage.js"
