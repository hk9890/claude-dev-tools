#!/usr/bin/env bash
# test-themes.sh — validate the Catppuccin theme files and guard generator drift.
#
# Checks:
#   1. Each of the four flavour files exists, is valid JSON, and is well-formed
#      (string .name, .base in {dark,light}, .overrides an object of hex colors).
#   2. Exactly four theme files are present (no strays).
#   3. The committed themes byte-match a fresh run of generate-themes.mjs — so
#      the generator and its output can never silently drift apart.
#   4. Override *key names* match the pinned token set. Checking only that values
#      are hex let a token Claude Code does not read (messageActionsBackground)
#      ship in all four flavours as inert config. Adding a role to the generator
#      must mean adding it here, having confirmed the name is one Claude Code
#      actually consumes — grep the CLI binary for it.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugins/claude-catppuccin"
THEMES_DIR="$PLUGIN_DIR/themes"

command -v jq >/dev/null 2>&1   || { echo "jq not found"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node not found"; exit 1; }

fail=0
note_fail() { printf 'FAIL: %s\n' "$1"; fail=1; }

expected_flavors=(latte frappe macchiato mocha)

# The exact set of theme tokens the plugin sets, sorted. Every name here was
# confirmed present in the Claude Code binary's theme vocabulary; the set is
# deliberately a whitelist, so an invented token fails rather than passing as
# a merely-unused key.
expected_tokens="$(printf '%s\n' \
  autoAccept bashBorder bashMessageBackgroundColor blue_FOR_SUBAGENTS_ONLY briefLabelClaude \
  briefLabelYou claude claudeShimmer cyan_FOR_SUBAGENTS_ONLY diffAdded diffAddedDimmed \
  diffAddedWord diffRemoved diffRemovedDimmed diffRemovedWord error fastMode fastModeShimmer \
  green_FOR_SUBAGENTS_ONLY ide inactive inactiveShimmer inverseText memoryBackgroundColor \
  merged orange_FOR_SUBAGENTS_ONLY permission permissionShimmer pink_FOR_SUBAGENTS_ONLY \
  planMode promptBorder promptBorderShimmer purple_FOR_SUBAGENTS_ONLY rainbow_blue \
  rainbow_blue_shimmer rainbow_green rainbow_green_shimmer rainbow_indigo \
  rainbow_indigo_shimmer rainbow_orange rainbow_orange_shimmer rainbow_red \
  rainbow_red_shimmer rainbow_violet rainbow_violet_shimmer rainbow_yellow \
  rainbow_yellow_shimmer rate_limit_empty rate_limit_fill red_FOR_SUBAGENTS_ONLY remember \
  selectionBg subtle success suggestion text userMessageBackground userMessageBackgroundHover \
  warning warningShimmer yellow_FOR_SUBAGENTS_ONLY | sort)"

# 1. Structural validation per flavour.
for flavor in "${expected_flavors[@]}"; do
  f="$THEMES_DIR/catppuccin-$flavor.json"
  [[ -f "$f" ]] || { note_fail "missing theme file: catppuccin-$flavor.json"; continue; }
  jq empty "$f" 2>/dev/null || { note_fail "invalid JSON: catppuccin-$flavor.json"; continue; }

  [[ -n "$(jq -r '.name // empty' "$f")" ]] || note_fail "$flavor: missing .name"

  base="$(jq -r '.base // empty' "$f")"
  [[ "$base" == "dark" || "$base" == "light" ]] \
    || note_fail "$flavor: .base must be dark|light (got '$base')"

  [[ "$(jq -r '.overrides | type' "$f")" == "object" ]] \
    || { note_fail "$flavor: .overrides is not an object"; continue; }

  bad="$(jq -r '.overrides | to_entries[]
                | select((.value | type) != "string" or (.value | test("^#[0-9a-f]{6}$") | not))
                | "\(.key)=\(.value)"' "$f")"
  [[ -z "$bad" ]] || note_fail "$flavor: non-hex override value(s): $bad"

  # Key names, not just values — an unrecognised token is silently inert.
  actual_tokens="$(jq -r '.overrides | keys_unsorted[]' "$f" | sort)"
  unknown="$(comm -23 <(printf '%s\n' "$actual_tokens") <(printf '%s\n' "$expected_tokens") | tr '\n' ' ')"
  absent="$(comm -13 <(printf '%s\n' "$actual_tokens") <(printf '%s\n' "$expected_tokens") | tr '\n' ' ')"
  [[ -z "${unknown// /}" ]] || note_fail "$flavor: override key(s) not in the pinned token set: $unknown"
  [[ -z "${absent// /}" ]] || note_fail "$flavor: pinned token(s) missing from overrides: $absent"
done

# 2. Exactly the four expected files, nothing extra.
count="$(find "$THEMES_DIR" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')"
[[ "$count" -eq 4 ]] || note_fail "expected 4 theme files in themes/, found $count"

# 3. Drift check — committed output must equal a fresh generation.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
if THEMES_OUT_DIR="$tmp" node "$PLUGIN_DIR/scripts/generate-themes.mjs" >/dev/null; then
  for flavor in "${expected_flavors[@]}"; do
    diff -q "$THEMES_DIR/catppuccin-$flavor.json" "$tmp/catppuccin-$flavor.json" >/dev/null 2>&1 \
      || note_fail "catppuccin-$flavor.json out of sync with generate-themes.mjs (run: node scripts/generate-themes.mjs)"
  done
  gen_count="$(find "$tmp" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')"
  [[ "$gen_count" -eq 4 ]] || note_fail "generator produced $gen_count files, expected 4"
else
  note_fail "generate-themes.mjs failed to run"
fi

if [[ "$fail" -eq 0 ]]; then
  printf 'PASS: 4 Catppuccin themes valid and in sync with generator\n'
fi
exit "$fail"
