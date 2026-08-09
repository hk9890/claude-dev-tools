#!/usr/bin/env bash
# test-server-lifetime.sh — server-side lifetime tests for html-visualization.
#
# Wraps test-server-lifetime.js (same directory). Picked up automatically by
# tests/run-all.sh via:
#   find "$TESTS_DIR" -mindepth 3 -maxdepth 3 -name 'test-*.sh' | sort
#
# Covers the heartbeat contract without a browser, so it runs everywhere the
# browser suite skips: argument validation, CSRF persistence, /ping and /bye
# semantics, and the per-mode exit codes on an abandoned page.
#
# Exit codes:
#   0  — all assertions passed
#   1  — one or more assertions failed
#   77 — skipped: node not on PATH

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$TESTS_DIR/test-server-lifetime.js"

if [[ ! -f "$SCRIPT" ]]; then
  printf 'FAIL: test-server-lifetime.js not found at %s\n' "$SCRIPT"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  printf 'SKIP: node is not on PATH; the html-visualization server needs it.\n'
  exit 77
fi

exec node "$SCRIPT"
