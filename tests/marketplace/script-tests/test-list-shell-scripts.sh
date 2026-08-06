#!/usr/bin/env bash
# test-list-shell-scripts.sh — pin scripts/list-shell-scripts.sh's coverage against drift.
#
# `mise run lint` and the CI shellcheck job both depend on this list. It must keep
# catching extensionless shell scripts under a plugin's bin/ (the keep-awake-linux
# gap this script was written to close) without pulling in non-shell bin/ scripts
# (html-visualization's bin/server.js, a Node script).
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/scripts/list-shell-scripts.sh"

PASS=0
FAIL=0
ok()   { printf 'PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }

[[ -f "$SCRIPT" ]] || { printf 'FAIL: %s not found\n' "$SCRIPT" >&2; exit 1; }

output="$(cd "$REPO_ROOT" && bash "$SCRIPT")"

if grep -qF "plugins/keep-awake-linux/bin/keep-awake" <<<"$output"; then
  ok "extensionless bash script under a plugin bin/ is included"
else
  fail "plugins/keep-awake-linux/bin/keep-awake missing from the list"
fi

if grep -qF "plugins/html-visualization/bin/server.js" <<<"$output"; then
  fail "plugins/html-visualization/bin/server.js (a Node script) should not be included"
else
  ok "non-shell bin/ script is excluded"
fi

if grep -qF "tests/run-all.sh" <<<"$output"; then
  ok "an ordinary tracked *.sh file is still included"
else
  fail "tests/run-all.sh missing from the list"
fi

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
