#!/usr/bin/env bash
# test-triage-scripts.sh — unit tests for plugins/project-auto-work/bin/triage-plan.py
# and triage-file.py. Wraps test-triage-scripts.py (same directory).
#
# Exit codes:
#   0 — all assertions passed
#   1 — one or more assertions failed (or python3 is unavailable)

set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

if ! command -v python3 >/dev/null 2>&1; then
  printf 'FAIL: python3 is required but was not found on PATH\n' >&2
  exit 1
fi

exec python3 "$REPO_ROOT/tests/project-auto-work/script-tests/test-triage-scripts.py"
