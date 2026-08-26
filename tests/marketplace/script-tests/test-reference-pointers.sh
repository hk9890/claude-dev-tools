#!/usr/bin/env bash
# test-reference-pointers.sh — every bundled reference file is reachable.
#
# A reference under a skill's references/ or a plugin-root references/ is loaded
# only when something points at it. Nothing in the harness reports a pointer that
# was reworded away, so the file stays on disk, ships in the plugin, and is never
# read again. This walks every reference file and requires at least one other file
# in the same plugin to name it.
#
# Naming, not linking, is the bar on purpose. The two layouts spell the same
# target differently — `references/x.md` from a skill, `../../references/x.md`
# from a plugin root — and some pointers are prose paths inside a workflow's agent
# prompt rather than Markdown links. Matching the basename covers all three.
#
# Exit codes: 0 — all assertions passed; 1 — one or more failed.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

PASS=0
FAIL=0
ok()   { printf 'PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }

mapfile -t REFS < <(
  find "$REPO_ROOT/plugins" \
    -path '*/references/*.md' -not -path '*/node_modules/*' | sort
)

if [[ "${#REFS[@]}" -eq 0 ]]; then
  printf 'FAIL: no reference files found under plugins/\n' >&2
  exit 1
fi

for ref in "${REFS[@]}"; do
  rel="${ref#"$REPO_ROOT"/}"
  plugin="${rel#plugins/}"
  plugin="${plugin%%/*}"
  base="$(basename "$ref")"

  # -l stops at the first hit per file; excluding the reference itself keeps a
  # file that names its own filename from vouching for itself.
  hit="$(grep -rlF "$base" "$REPO_ROOT/plugins/$plugin" | grep -vxF "$ref" | head -n 1)"

  if [[ -n "$hit" ]]; then
    ok "$rel <- ${hit#"$REPO_ROOT"/}"
  else
    fail "$rel — nothing in plugins/$plugin names it; the file ships but is unreachable"
  fi
done

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
