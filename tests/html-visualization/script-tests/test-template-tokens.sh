#!/usr/bin/env bash
# The visualize template holds a copy of the design tokens, because it renders from
# file:// and cannot @import tokens.css. Pin the copy to its source.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
PLUGIN="$REPO_ROOT/plugins/html-visualization"
SCRIPT="$PLUGIN/scripts/sync-template-tokens.py"

PASS=0
FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

if python3 "$SCRIPT" --check >/dev/null 2>&1; then
  ok "the template's token copy matches tokens.css"
else
  fail "the template's token copy differs from tokens.css: run $SCRIPT"
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp "$PLUGIN/assets/shared/tokens.css" "$TMP/tokens.css"
cp "$PLUGIN/references/visualize-template.html" "$TMP/template.html"
sed -i 's/--hv-page:[^;]*;/--hv-page: 1px;/' "$TMP/tokens.css"

if python3 "$SCRIPT" --check "$TMP/tokens.css" "$TMP/template.html" >/dev/null 2>&1; then
  fail "--check misses a changed token"
else
  ok "--check reports a changed token"
fi
python3 "$SCRIPT" "$TMP/tokens.css" "$TMP/template.html" >/dev/null
if grep -q -- '--hv-page: 1px;' "$TMP/template.html" && python3 "$SCRIPT" --check "$TMP/tokens.css" "$TMP/template.html"; then
  ok "a sync copies the change and leaves the copy in step"
else
  fail "a sync did not copy the changed token"
fi
if [[ "$(wc -l < "$TMP/template.html")" -eq "$(wc -l < "$PLUGIN/references/visualize-template.html")" ]]; then
  ok "a sync keeps the rest of the template"
else
  fail "a sync changed the template's length"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
