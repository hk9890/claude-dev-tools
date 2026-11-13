#!/usr/bin/env bash
# test-plugin-icons.sh — every plugin's committed icon is the one generate-plugin-icons.py writes.
#
# The generator runs in a scratch copy of the repo root, so the test changes nothing in the
# checkout. It fails on a plugin with no icon, an icon edited by hand, and a plugin the
# generator has no monogram or colour for.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

PASS=0
FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

mkdir -p "$SCRATCH/scripts" "$SCRATCH/.claude-plugin"
cp "$REPO_ROOT/scripts/generate-plugin-icons.py" "$SCRATCH/scripts/"
cp "$REPO_ROOT/.claude-plugin/marketplace.json" "$SCRATCH/.claude-plugin/"
while IFS= read -r source; do
  mkdir -p "$SCRATCH/$source/.claude-plugin"
done < <(jq -r '.plugins[].source' "$REPO_ROOT/.claude-plugin/marketplace.json")

if output="$(python3 "$SCRATCH/scripts/generate-plugin-icons.py" 2>&1)"; then
  ok "the generator knows every plugin"
else
  fail "the generator stopped: $output"
fi

while IFS= read -r source; do
  icon="$source/.claude-plugin/icon.png"
  if [[ ! -f "$REPO_ROOT/$icon" ]]; then
    fail "$icon is missing; run python3 scripts/generate-plugin-icons.py"
  elif cmp -s "$REPO_ROOT/$icon" "$SCRATCH/$icon"; then
    ok "$icon matches the generator"
  else
    fail "$icon differs from the generator; run python3 scripts/generate-plugin-icons.py"
  fi
done < <(jq -r '.plugins[].source' "$REPO_ROOT/.claude-plugin/marketplace.json")

echo "Passed: $PASS  Failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
