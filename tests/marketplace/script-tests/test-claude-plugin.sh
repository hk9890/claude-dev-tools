#!/usr/bin/env bash
# test-claude-plugin.sh — validate every plugin and the marketplace, and test every mod.
#
# `claude plugin validate --strict` reads each manifest and its components as Claude Code will at
# load, type-checks a mod's hooks module, and fails on a warning (a plugin directory warning, such
# as a missing icon, excepted). A mod is a plugin whose
# hooks/hooks.json names a hooks module under `modules`; for each one `claude plugin test` runs
# the plugin's own tests/*.test.ts against the engine, with no session, sign-in or network.
#
# Exit codes:
#   0  — every validation and every mod test passed
#   1  — a validation or a test failed
#   77 — skipped: `claude` is absent or older than the first release whose strict validation
#        type-checks a hooks module; below it a type error would pass.
#        REQUIRE_CLAUDE=1 turns the skip into a failure.

set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

MIN_VERSION="2.1.323"

skip() {
  printf 'SKIP: %s\n' "$1"
  [[ "${REQUIRE_CLAUDE:-0}" == "1" ]] && exit 1
  exit 77
}

command -v claude >/dev/null 2>&1 || skip "claude is not on PATH"
version="$(claude --version 2>/dev/null | awk '{print $1}')"
[[ "$(printf '%s\n%s\n' "$MIN_VERSION" "$version" | sort -V | head -n1)" == "$MIN_VERSION" ]] \
  || skip "claude $version is older than $MIN_VERSION, the first release that type-checks a hooks module"
echo "claude $version"

MODS=()
for hooks_json in "$REPO_ROOT"/plugins/*/hooks/hooks.json; do
  jq -e 'has("modules")' "$hooks_json" >/dev/null 2>&1 && MODS+=("$(dirname "$(dirname "$hooks_json")")")
done
[[ "${#MODS[@]}" -gt 0 ]] || { echo "FAIL: no plugin with a modules key found"; exit 1; }

failures=0

for target in "$REPO_ROOT" "$REPO_ROOT"/plugins/*/; do
  target="${target%/}"
  name="${target#"$REPO_ROOT"}"
  name="${name#/}"
  if out="$(claude plugin validate --strict "$target" 2>&1)"; then
    echo "PASS: validate ${name:-marketplace}"
  else
    echo "FAIL: validate ${name:-marketplace}"
    printf '%s\n' "$out"
    failures=$((failures + 1))
  fi
done

for mod in "${MODS[@]}"; do
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
