#!/usr/bin/env bash
# test-mermaid-contract.sh — pin the Mermaid integration against drift.
#
# The Mermaid init block is authored in TWO places that must stay in agreement:
#   - skills/html-visualize/references/visualize.md         (the documented snippet)
#   - skills/html-visualize/references/visualize-template.html (the ready-to-uncomment copy)
# They are not byte-identical — the template's copy lives inside an HTML comment at a
# different indent — so this pins the load-bearing invariants rather than the literal text.
#
# The token check is the point of this suite. Mermaid cannot read CSS custom properties,
# so the bridge names each --hv-* token as a STRING. A typo or an invented token fails
# silently at runtime: getPropertyValue returns "" and Mermaid quietly falls back to its
# own palette. That is exactly the class of bug the theme-token pinning elsewhere exists
# to catch, and it is invisible without an assertion.
#
# Exit codes: 0 — all assertions passed; 1 — one or more failed.

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
REF_DIR="$REPO_ROOT/plugins/html-visualization/skills/html-visualize/references"
DOC="$REF_DIR/visualize.md"
TPL="$REF_DIR/visualize-template.html"

PASS=0
FAIL=0
ok()   { printf 'PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }

for f in "$DOC" "$TPL"; do
  [[ -f "$f" ]] || { fail "$(basename "$f") — file not found"; }
done
[[ -f "$DOC" && -f "$TPL" ]] || { printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"; exit 1; }

# ── 1. Both copies pin the same Mermaid major version and module flavour ──────
CDN='mermaid@11/dist/mermaid.esm.min.mjs'
for f in "$DOC" "$TPL"; do
  n="$(basename "$f")"
  if grep -Fq "$CDN" "$f"; then
    ok "$n imports $CDN"
  else
    fail "$n — expected the Mermaid v11 ESM import ($CDN)"
  fi
done

# Mermaid v10 was UMD via <script src>; v11 is ESM. A leftover v10 reference means one
# copy was updated and the other was not.
for f in "$DOC" "$TPL"; do
  n="$(basename "$f")"
  if grep -Fq 'mermaid@10' "$f"; then
    fail "$n — stale mermaid@10 reference (v10 is UMD; this integration is v11 ESM)"
  else
    ok "$n carries no stale mermaid@10 reference"
  fi
done

# ── 2. Both copies carry the theme bridge and the re-render listener ──────────
for f in "$DOC" "$TPL"; do
  n="$(basename "$f")"
  if grep -Fq 'themeVariables' "$f"; then
    ok "$n wires themeVariables"
  else
    fail "$n — themeVariables bridge missing; Mermaid will ignore the --hv-* tokens"
  fi
  if grep -Fq "matchMedia" "$f" && grep -Fq 'prefers-color-scheme: dark' "$f"; then
    ok "$n re-renders on a colour-scheme change"
  else
    fail "$n — missing the prefers-color-scheme listener; diagrams keep stale theme colours"
  fi
  # theme:"base" is what makes themeVariables take effect at all — any other theme
  # silently ignores them.
  if grep -Eq 'theme:[[:space:]]*"base"' "$f"; then
    ok "$n uses theme \"base\" (required for themeVariables to apply)"
  else
    fail "$n — themeVariables only apply under theme \"base\""
  fi
  # The FOUC guard hides pre.mermaid until it is marked processed. If Mermaid never
  # loads, something must release it or the page shows an empty bordered box forever.
  # The import must be DYNAMIC: a failing static import aborts the module, so a catch
  # inside it can never run.
  if grep -Fq 'await import(' "$f" && grep -Fq 'reveal' "$f"; then
    ok "$n releases the FOUC guard when Mermaid fails to load"
  else
    fail "$n — no dynamic-import fallback; a blocked CDN leaves an empty box with no source"
  fi
  if grep -qE '^\s*import mermaid from' "$f"; then
    fail "$n — static \`import mermaid from\` aborts the whole module on failure; use await import()"
  else
    ok "$n avoids a static Mermaid import"
  fi
done

# ── 3. Every --hv-* token the bridge names must exist in the template ─────────
# Collect tokens referenced via hv("--hv-…") in either copy, then require each to be
# defined in the template's :root block.
mapfile -t REFERENCED < <(grep -ohE 'hv\("(--hv-[a-z0-9-]+)"\)' "$DOC" "$TPL" \
  | sed -E 's/.*"(--hv-[a-z0-9-]+)".*/\1/' | sort -u)

if [[ "${#REFERENCED[@]}" -eq 0 ]]; then
  fail "no --hv-* tokens referenced by the Mermaid bridge — the theme wiring is missing"
else
  for tok in "${REFERENCED[@]}"; do
    if grep -qE "^[[:space:]]*${tok}:" "$TPL"; then
      ok "token $tok is defined in the template"
    else
      fail "token $tok is referenced by the Mermaid bridge but not defined in the template"
    fi
  done
fi

# ── 4. The container classes the guidance tells Claude to use must exist ──────
for cls in 'vis-mermaid-wrap' 'vis-compare' 'vis-mermaid-label'; do
  if grep -Fq ".$cls" "$TPL"; then
    ok "template styles .$cls"
  else
    fail "template — .$cls is referenced by the Mermaid guidance but has no styles"
  fi
done

# ── 5. No CSS function inside a classDef declaration ──────────────────────────
# Mermaid parses classDef itself: `classDef leak stroke:var(--hv-bad)` is a hard parse
# error on the "(" and takes the ENTIRE diagram down, not just the colour. Verified
# against mermaid@11. Colour belongs in CSS targeting the emitted class instead. This
# is easy to reintroduce, because it looks like exactly the theme-aware thing to do.
# Both files deliberately SHOW the broken form while warning against it, always inside
# inline backticks. Strip `...` spans first so the warning text does not trip its own
# check; a real declaration is never written inside backticks.
bad_classdef=0
while IFS= read -r line; do
  bad_classdef=$((bad_classdef + 1))
  fail "classDef carries a CSS function — parse error, kills the diagram: ${line}"
done < <(
  for f in "$DOC" "$TPL"; do
    sed 's/`[^`]*`//g' "$f" | grep -nE 'classDef[^;]*[a-z-]+\([^)]*\)' | sed "s|^|$(basename "$f"):|"
  done
)
[[ "$bad_classdef" -eq 0 ]] && ok "no classDef declaration carries a CSS function"

# The semantic colour layer the guidance points at must actually exist in the template.
for cls in leak dead god misplaced deep; do
  if grep -Eq "\.vis-mermaid-wrap \.$cls" "$TPL"; then
    ok "template colours .$cls from a token"
  else
    fail "template — .$cls has no semantic colour rule; classDef cannot colour it itself"
  fi
done

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
