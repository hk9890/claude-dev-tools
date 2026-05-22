#!/usr/bin/env bash
# test-browser.sh — Playwright/Chromium browser regression tests for the
# html-visualization plugin.
#
# Wraps test-browser.js (same directory). Picked up automatically by
# tests/html-visualization/script-tests/run-all.sh via:
#   find "$TESTS_DIR" -maxdepth 1 -name 'test-*.sh' | sort
#
# Exit codes:
#   0 — all browser assertions passed
#   1 — one or more assertions failed

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BROWSER_SCRIPT="$TESTS_DIR/test-browser.js"

if [[ ! -f "$BROWSER_SCRIPT" ]]; then
  printf 'FAIL: test-browser.js not found at %s\n' "$BROWSER_SCRIPT"
  exit 1
fi

# Chromium needs this env var to locate the cached browsers.
export PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"

# Run the Node script and stream its output.
exec node "$BROWSER_SCRIPT"
