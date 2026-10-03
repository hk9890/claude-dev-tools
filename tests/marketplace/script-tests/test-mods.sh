#!/usr/bin/env bash
# test-mods.sh — validate and test every plugin that ships a mod.
#
# A mod is a plugin whose hooks/hooks.json names a hooks module under `modules`. For each one
# this runs `claude plugin validate` (the manifest and the static analysis Claude Code applies
# at load) and `claude plugin test` (the plugin's own tests/*.test.ts, against the engine, with
# no session, sign-in or network).
#
# Exit codes:
#   0  — every mod validated and its tests passed
#   1  — a validation or a test failed
#   77 — skipped: `claude` is absent or older than the first release with mods.
#        REQUIRE_CLAUDE=1 turns the skip into a failure.

set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

MIN_VERSION="2.1.287"

skip() {
  printf 'SKIP: %s\n' "$1"
  [[ "${REQUIRE_CLAUDE:-0}" == "1" ]] && exit 1
  exit 77
}

command -v claude >/dev/null 2>&1 || skip "claude is not on PATH"
version="$(claude --version 2>/dev/null | awk '{print $1}')"
[[ "$(printf '%s\n%s\n' "$MIN_VERSION" "$version" | sort -V | head -n1)" == "$MIN_VERSION" ]] \
  || skip "claude $version is older than $MIN_VERSION, the first release with mods"

MODS=()
for hooks_json in "$REPO_ROOT"/plugins/*/hooks/hooks.json; do
  jq -e 'has("modules")' "$hooks_json" >/dev/null 2>&1 && MODS+=("$(dirname "$(dirname "$hooks_json")")")
done
[[ "${#MODS[@]}" -gt 0 ]] || { echo "FAIL: no plugin with a modules key found"; exit 1; }

failures=0

for mod in "${MODS[@]}"; do
  if out="$(claude plugin validate "$mod" 2>&1)"; then
    echo "PASS: validate ${mod#"$REPO_ROOT"/}"
  else
    echo "FAIL: validate ${mod#"$REPO_ROOT"/}"
    printf '%s\n' "$out"
    failures=$((failures + 1))
  fi

  if out="$(claude plugin test "$mod" 2>&1)"; then
    echo "PASS: test ${mod#"$REPO_ROOT"/} ($(printf '%s\n' "$out" | grep -E '^ *[0-9]+ pass$' | xargs))"
  else
    echo "FAIL: test ${mod#"$REPO_ROOT"/}"
    printf '%s\n' "$out"
    failures=$((failures + 1))
  fi
done

[[ $failures -eq 0 ]] || { echo "$failures failure(s)"; exit 1; }
echo "all passed"
