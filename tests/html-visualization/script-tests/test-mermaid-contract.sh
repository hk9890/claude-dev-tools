#!/usr/bin/env bash
# test-mermaid-contract.sh — pin the Mermaid integration against drift.
#
# The Mermaid init block is authored in TWO places that must stay in agreement:
#   - skills/html-visualize/references/mermaid.md           (the documented snippet,
#     shared by every mode that draws a graph)
#   - skills/html-visualize/references/visualize-template.html (the ready-to-uncomment copy)
# They are not byte-identical — the template's copy lives inside an HTML comment at a
# different indent — so this pins the load-bearing invariants rather than the literal text.
#
# The container styles have TWO homes too, one per mode: the template's inline <style>
# for visualize (self-contained, file://-capable) and assets/ask/style.css for ask. A
# diagram authored per mermaid.md into an ask form renders unstyled if that second copy
# is missing, and nothing else would catch it.
#
# The token check is the point of this suite. Mermaid cannot read CSS custom properties,
# so the bridge names each --hv-* token as a STRING. A typo or an invented token fails
# silently at runtime: getPropertyValue returns "" and Mermaid quietly falls back to its
# own palette. That is exactly the class of bug the theme-token pinning elsewhere exists
# to catch, and it is invisible without an assertion.
#
# Exit codes: 0 — all assertions passed; 1 — one or more failed.

set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
REF_DIR="$REPO_ROOT/plugins/html-visualization/skills/html-visualize/references"
DOC="$REF_DIR/mermaid.md"
TPL="$REF_DIR/visualize-template.html"
ASK_CSS="$REPO_ROOT/plugins/html-visualization/assets/ask/style.css"

PASS=0
FAIL=0
ok()   { printf 'PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }

for f in "$DOC" "$TPL" "$ASK_CSS"; do
  [[ -f "$f" ]] || { fail "$(basename "$f") — file not found"; }
done
[[ -f "$DOC" && -f "$TPL" && -f "$ASK_CSS" ]] || { printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"; exit 1; }

# ── 0. Every mode that offers diagrams must route to the shared snippet ───────
# mermaid.md is reachable only through these pointers; a mode that stops naming it
# silently loses the integration while its guidance still tells Claude to draw.
for mode in visualize ask; do
  if grep -Fq 'references/mermaid.md' "$REF_DIR/$mode.md"; then
    ok "$mode.md points at references/mermaid.md"
  else
    fail "$mode.md — no pointer to references/mermaid.md; the module block is unreachable"
  fi
done

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
# Once per mode: the visualize template's inline <style>, and ask mode's stylesheet.
for cls in 'vis-mermaid-wrap' 'vis-compare' 'vis-mermaid-label'; do
  if grep -Fq ".$cls" "$TPL"; then
    ok "template styles .$cls"
  else
    fail "template — .$cls is referenced by the Mermaid guidance but has no styles"
  fi
  if grep -Fq ".$cls" "$ASK_CSS"; then
    ok "ask/style.css styles .$cls"
  else
    fail "ask/style.css — .$cls is referenced by the Mermaid guidance but has no styles"
  fi
done

# The FOUC guard is part of the container contract, not the module block: without it
# the raw Mermaid source flashes as text before the script runs.
if grep -Fq 'pre.mermaid:not([data-processed])' "$ASK_CSS"; then
  ok "ask/style.css carries the FOUC guard"
else
  fail "ask/style.css — no pre.mermaid:not([data-processed]) rule; diagram source flashes on load"
fi

# ── 5. The zoom control reaches every mode ────────────────────────────────────
# The served modes link assets/shared/overlay.{css,js}; the template inlines both to
# stay file://-capable. Drift between them is silent — the button renders and simply
# opens an empty panel — so pin each declaration the pair depends on.
OVERLAY_CSS="$REPO_ROOT/plugins/html-visualization/assets/shared/overlay.css"
OVERLAY_JS="$REPO_ROOT/plugins/html-visualization/assets/shared/overlay.js"

for f in "$OVERLAY_CSS" "$OVERLAY_JS"; do
  [[ -f "$f" ]] || fail "$(basename "$f") — file not found"
done

for cls in 'hv-zoom-btn' 'hv-popover-wide' 'hv-popover-body'; do
  if grep -Fq ".$cls" "$OVERLAY_CSS"; then
    ok "overlay.css styles .$cls"
  else
    fail "overlay.css — .$cls is named by the zoom markup but has no styles"
  fi
  # The template's inline copy must carry the same rule.
  if grep -Fq ".$cls" "$TPL"; then
    ok "template inlines .$cls"
  else
    fail "template — .$cls missing from the inline overlay copy; zoom panel renders unstyled"
  fi
done

# A closed [popover] is hidden by `display: none` in the UA stylesheet. Declaring any
# other display on the element itself overrides that and pins the panel open, so it
# covers the page as a blank box and NOTHING else on the page is reachable. The rule
# must sit on :popover-open instead. This shipped once; it is invisible to any check
# that only fetches the page.
for f in "$OVERLAY_CSS" "$TPL"; do
  n="$(basename "$f")"
  # Only the bare `.hv-popover-wide {` block — descendant rules like
  # `.hv-popover-wide .hv-popover-body` set display legitimately.
  if awk '/^[[:space:]]*\.hv-popover-wide[[:space:]]*\{/,/\}/' "$f" | grep -qE '^[[:space:]]*display:'; then
    fail "$n — .hv-popover-wide sets display outside :popover-open; the panel stays open and blanks the page"
  else
    ok "$n keeps display off the closed .hv-popover-wide"
  fi
  if grep -Fq '.hv-popover-wide:popover-open' "$f"; then
    ok "$n sets the panel's display on :popover-open"
  else
    fail "$n — no .hv-popover-wide:popover-open rule; the zoom panel would never lay out"
  fi
done

# Stripping ids from the clone breaks Mermaid's own <style>, which scopes every rule to
# the svg's id: the panel then renders black default nodes with clipped labels.
for f in "$OVERLAY_JS" "$TPL"; do
  n="$(basename "$f")"
  if grep -qE "removeAttribute\(['\"]id" "$f"; then
    fail "$n — clone strips ids; Mermaid's id-scoped <style> stops matching and the zoom renders unstyled"
  else
    ok "$n leaves the clone's ids intact"
  fi
done

# The clone step is what lets a diagram be authored once. Without it the panel opens
# empty and the make-big button looks broken rather than absent.
for f in "$OVERLAY_JS" "$TPL"; do
  n="$(basename "$f")"
  if grep -Fq 'hv-popover-body' "$f" && grep -Fq 'cloneNode' "$f"; then
    ok "$n clones the diagram into the zoom panel"
  else
    fail "$n — no cloneNode into .hv-popover-body; the zoom panel would open empty"
  fi
done

# mermaid.md is where an author learns the markup; if it stops describing the control,
# diagrams ship without one and the styles above are dead.
if grep -Fq 'hv-zoom-btn' "$DOC"; then
  ok "mermaid.md documents the zoom control"
else
  fail "mermaid.md — no .hv-zoom-btn markup; authors would never add one"
fi

# ── 6. One page measure across the modes ──────────────────────────────────────
# ask, feedback and visualize used to disagree (760/840/900). The token is the fix;
# a mode reintroducing its own max-width silently opts out of it.
if grep -Eq '^\s*--hv-page:' "$REPO_ROOT/plugins/html-visualization/assets/shared/tokens.css"; then
  ok "tokens.css defines --hv-page"
else
  fail "tokens.css — --hv-page is missing; the modes have no shared page measure"
fi

if grep -Eq '^\s*--hv-page:' "$TPL"; then
  ok "template inlines --hv-page"
else
  fail "template — --hv-page missing from the inline token copy"
fi

for f in "$ASK_CSS" "$REPO_ROOT/plugins/html-visualization/assets/feedback/style.css"; do
  n="$(basename "$(dirname "$f")")/$(basename "$f")"
  if grep -Eq '\.page-chrome\s*\{[^}]*max-width' "$(dirname "$f")/style.css" 2>/dev/null; then
    fail "$n — sets its own .page-chrome max-width, overriding the shared --hv-page"
  else
    ok "$n takes the shared page measure"
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
