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
#   5. plugin.json's experimental.themes path resolves to this same themes/
#      directory — the manifest key CODING.md documents as this plugin's wiring
#      into the harness, checked here since no schema validator covers it.

set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
PLUGIN_DIR="$REPO_ROOT/plugins/claude-catppuccin"
THEMES_DIR="$PLUGIN_DIR/themes"

command -v jq >/dev/null 2>&1   || { echo "jq not found"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node not found"; exit 1; }

PASS=0
FAIL=0
ok()   { printf 'PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }

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
  if [[ -f "$f" ]]; then
    ok "$flavor: theme file present"
  else
    fail "$flavor: missing theme file catppuccin-$flavor.json"
    continue
  fi

  if jq empty "$f" 2>/dev/null; then
    ok "$flavor: valid JSON"
  else
    fail "$flavor: invalid JSON"
    continue
  fi

  if [[ -n "$(jq -r '.name // empty' "$f")" ]]; then
    ok "$flavor: .name is a non-empty string"
  else
    fail "$flavor: missing .name"
  fi

  base="$(jq -r '.base // empty' "$f")"
  if [[ "$base" == "dark" || "$base" == "light" ]]; then
    ok "$flavor: .base is $base"
  else
    fail "$flavor: .base must be dark|light (got '$base')"
  fi

  if [[ "$(jq -r '.overrides | type' "$f")" == "object" ]]; then
    ok "$flavor: .overrides is an object"
  else
    fail "$flavor: .overrides is not an object"
    continue
  fi

  bad="$(jq -r '.overrides | to_entries[]
                | select((.value | type) != "string" or (.value | test("^#[0-9a-f]{6}$") | not))
                | "\(.key)=\(.value)"' "$f")"
  if [[ -z "$bad" ]]; then
    ok "$flavor: every override value is a 6-digit hex colour"
  else
    fail "$flavor: non-hex override value(s): $bad"
  fi

  # Key names, not just values — an unrecognised token is silently inert.
  actual_tokens="$(jq -r '.overrides | keys_unsorted[]' "$f" | sort)"
  unknown="$(comm -23 <(printf '%s\n' "$actual_tokens") <(printf '%s\n' "$expected_tokens") | tr '\n' ' ')"
  absent="$(comm -13 <(printf '%s\n' "$actual_tokens") <(printf '%s\n' "$expected_tokens") | tr '\n' ' ')"
  if [[ -z "${unknown// /}" ]]; then
    ok "$flavor: no override key outside the pinned token set"
  else
    fail "$flavor: override key(s) not in the pinned token set: $unknown"
  fi
  if [[ -z "${absent// /}" ]]; then
    ok "$flavor: every pinned token present in overrides"
  else
    fail "$flavor: pinned token(s) missing from overrides: $absent"
  fi
done

# 2. Exactly the four expected files, nothing extra.
count="$(find "$THEMES_DIR" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')"
if [[ "$count" -eq 4 ]]; then
  ok "themes/ holds exactly 4 theme files"
else
  fail "expected 4 theme files in themes/, found $count"
fi

# 3. Drift check — committed output must equal a fresh generation.
# Unguarded, an empty $tmp would make generate-themes.mjs fall back to its default
# THEMES_OUT_DIR and overwrite the committed themes this suite is checking.
tmp="$(mktemp -d)" || { printf 'FAIL: mktemp -d unavailable — drift check not run\n'; exit 1; }
trap 'rm -rf "$tmp"' EXIT
if THEMES_OUT_DIR="$tmp" node "$PLUGIN_DIR/scripts/generate-themes.mjs" >/dev/null; then
  ok "generate-themes.mjs runs"
  for flavor in "${expected_flavors[@]}"; do
    if diff -q "$THEMES_DIR/catppuccin-$flavor.json" "$tmp/catppuccin-$flavor.json" >/dev/null 2>&1; then
      ok "$flavor: committed theme matches a fresh generation"
    else
      fail "catppuccin-$flavor.json out of sync with generate-themes.mjs (run: node scripts/generate-themes.mjs)"
    fi
  done
  gen_count="$(find "$tmp" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')"
  if [[ "$gen_count" -eq 4 ]]; then
    ok "generator produced exactly 4 files"
  else
    fail "generator produced $gen_count files, expected 4"
  fi
else
  fail "generate-themes.mjs failed to run"
fi

# 5. Manifest wiring — plugin.json's experimental.themes must point at this themes/ dir.
manifest="$PLUGIN_DIR/.claude-plugin/plugin.json"
themes_key="$(jq -r '.experimental.themes // empty' "$manifest")"
if [[ -z "$themes_key" ]]; then
  fail "plugin.json is missing .experimental.themes"
else
  resolved="$(cd "$PLUGIN_DIR" && cd "$themes_key" 2>/dev/null && pwd)"
  if [[ "$resolved" == "$THEMES_DIR" ]]; then
    ok "plugin.json's experimental.themes resolves to themes/"
  else
    fail "plugin.json's experimental.themes ('$themes_key') resolves to '${resolved:-<not found>}', expected $THEMES_DIR"
  fi
fi

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
