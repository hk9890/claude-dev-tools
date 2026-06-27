#!/usr/bin/env bash
# test-check-internal-consistency.sh — fixture-based tests for
# scripts/check-internal-consistency.py
#
# Covers:
#   - live: full repo scan exits 0 and resolves at least one real reference
#   - fail/section: bogus "Phrase section in file.md" reference exits non-zero
#   - fail/version: desynced plugin.json version exits non-zero
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/scripts/check-internal-consistency.py"
EXAMPLES="$REPO_ROOT/tests/marketplace/script-tests/examples"

PASS=0
FAIL=0

# ── helpers ──────────────────────────────────────────────────────────────────

ok() {
  printf 'PASS: %s\n' "$1"
  PASS=$((PASS + 1))
}

fail() {
  printf 'FAIL: %s\n' "$1"
  FAIL=$((FAIL + 1))
}

assert_exit() {
  local label="$1" expected_code="$2"
  shift 2
  local actual_code=0
  "$@" >/dev/null 2>&1 || actual_code=$?
  if [[ "$actual_code" -eq "$expected_code" ]]; then
    ok "$label (exit $expected_code)"
  else
    fail "$label — expected exit $expected_code, got $actual_code"
  fi
}

assert_output_contains() {
  local label="$1" needle="$2"
  shift 2
  local out code=0
  out=$("$@" 2>&1) || code=$?
  if printf '%s' "$out" | grep -qF "$needle"; then
    ok "$label"
  else
    fail "$label — expected output to contain $(printf '%q' "$needle")"
    printf '  actual output:\n%s\n' "$out"
  fi
}

assert_output_matches() {
  local label="$1" pattern="$2"
  shift 2
  local out code=0
  out=$("$@" 2>&1) || code=$?
  if printf '%s' "$out" | grep -qE "$pattern"; then
    ok "$label"
  else
    fail "$label — expected output to match $(printf '%q' "$pattern")"
    printf '  actual output:\n%s\n' "$out"
  fi
}

# ── test cases ────────────────────────────────────────────────────────────────

# 1. Live repo: full scan exits 0 on current main
test_live_repo_passes() {
  assert_exit "live-repo: exits 0 on main" 0 \
    python3 "$SCRIPT" --repo-root "$REPO_ROOT"
}

# 2. Live repo: scanner resolves at least one real reference (not a no-op)
test_live_repo_resolves_refs() {
  assert_output_matches \
    "live-repo: scanner resolves >=1 real section reference" \
    'PASS \([1-9][0-9]* ' \
    python3 "$SCRIPT" --repo-root "$REPO_ROOT"
}

# 3. Negative / section: bogus "Phrase section in file.md" reference exits non-zero
test_bad_section_ref_fails() {
  assert_exit "bad-section: non-zero exit for unresolvable section phrase" 1 \
    python3 "$SCRIPT" \
      --repo-root "$REPO_ROOT" \
      --check-sections "$EXAMPLES/bad-section/referencing.md" \
      --skip-versions
}

# 4. Negative / section: failure message mentions the bad phrase
test_bad_section_ref_message() {
  assert_output_contains \
    "bad-section: output mentions the unresolvable phrase" \
    "Bogus Configuration Options" \
    python3 "$SCRIPT" \
      --repo-root "$REPO_ROOT" \
      --check-sections "$EXAMPLES/bad-section/referencing.md" \
      --skip-versions
}

# 5. Negative / version: desynced plugin.json exits non-zero
test_bad_version_fails() {
  assert_exit "bad-version: non-zero exit for version mismatch" 1 \
    python3 "$SCRIPT" \
      --repo-root "$REPO_ROOT" \
      --check-versions "$EXAMPLES/bad-version/plugins/myplugin/.claude-plugin/plugin.json" \
      --marketplace "$EXAMPLES/bad-version/.claude-plugin/marketplace.json" \
      --skip-sections
}

# 6. Negative / version: failure message mentions the plugin name and versions
test_bad_version_message() {
  assert_output_contains \
    "bad-version: output mentions version mismatch detail" \
    "version mismatch" \
    python3 "$SCRIPT" \
      --repo-root "$REPO_ROOT" \
      --check-versions "$EXAMPLES/bad-version/plugins/myplugin/.claude-plugin/plugin.json" \
      --marketplace "$EXAMPLES/bad-version/.claude-plugin/marketplace.json" \
      --skip-sections
}

# 7. Good section ref: a correctly resolving reference exits 0
test_good_section_ref_passes() {
  local tmp_dir
  tmp_dir=$(mktemp -d)

  # Create a target file with a real heading
  printf '# Target Doc\n\n## Quick Start\n\nContent here.\n' > "$tmp_dir/guide.md"
  # Create a referencing file with a valid cross-reference (2-word phrase)
  printf '# Ref\n\nSee the Quick Start section in guide.md for details.\n' \
    > "$tmp_dir/referencing.md"

  assert_exit "good-section-ref: valid reference exits 0" 0 \
    python3 "$SCRIPT" \
      --repo-root "$REPO_ROOT" \
      --check-sections "$tmp_dir/referencing.md" \
      --skip-versions

  rm -rf "$tmp_dir"
}

# 8. Good version match: matching versions exit 0
test_good_version_passes() {
  local tmp_dir
  tmp_dir=$(mktemp -d)
  mkdir -p "$tmp_dir/.claude-plugin" "$tmp_dir/plugins/alpha/.claude-plugin"

  printf '{"name":"alpha","version":"2.0.0","description":"x","author":{"name":"T"}}\n' \
    > "$tmp_dir/plugins/alpha/.claude-plugin/plugin.json"
  printf '{"name":"t","plugins":[{"name":"alpha","version":"2.0.0","description":"x","source":"./plugins/alpha"}]}\n' \
    > "$tmp_dir/.claude-plugin/marketplace.json"

  assert_exit "good-version: matching versions exit 0" 0 \
    python3 "$SCRIPT" \
      --repo-root "$REPO_ROOT" \
      --check-versions "$tmp_dir/plugins/alpha/.claude-plugin/plugin.json" \
      --marketplace "$tmp_dir/.claude-plugin/marketplace.json" \
      --skip-sections

  rm -rf "$tmp_dir"
}

# 9. Negative / uniformity: an entry out of version lockstep exits non-zero.
#    Each plugin entry could still mirror its own plugin.json (Check B green),
#    but one entry diverges from metadata.version — the project-explore-at-1.17
#    case Check B alone cannot catch. Isolate Check D via the skip flags.
test_version_uniformity_fails() {
  local tmp_dir
  tmp_dir=$(mktemp -d)
  mkdir -p "$tmp_dir/.claude-plugin"
  printf '%s\n' \
    '{"name":"t","metadata":{"version":"1.0.0"},"plugins":[{"name":"alpha","version":"1.0.0","description":"a","source":"./plugins/alpha"},{"name":"beta","version":"1.1.0","description":"b","source":"./plugins/beta"}]}' \
    > "$tmp_dir/.claude-plugin/marketplace.json"

  assert_exit "uniformity: non-zero exit when an entry breaks version lockstep" 1 \
    python3 "$SCRIPT" --repo-root "$REPO_ROOT" \
      --marketplace "$tmp_dir/.claude-plugin/marketplace.json" \
      --skip-sections --skip-versions --skip-descriptions

  assert_output_contains \
    "uniformity: output names the lockstep break" \
    "version lockstep broken" \
    python3 "$SCRIPT" --repo-root "$REPO_ROOT" \
      --marketplace "$tmp_dir/.claude-plugin/marketplace.json" \
      --skip-sections --skip-versions --skip-descriptions

  rm -rf "$tmp_dir"
}

# 10. Positive / uniformity: metadata.version and all entries equal => exit 0
test_version_uniformity_passes() {
  local tmp_dir
  tmp_dir=$(mktemp -d)
  mkdir -p "$tmp_dir/.claude-plugin"
  printf '%s\n' \
    '{"name":"t","metadata":{"version":"1.0.0"},"plugins":[{"name":"alpha","version":"1.0.0","description":"a","source":"./plugins/alpha"},{"name":"beta","version":"1.0.0","description":"b","source":"./plugins/beta"}]}' \
    > "$tmp_dir/.claude-plugin/marketplace.json"

  assert_exit "uniformity: all-equal versions exit 0" 0 \
    python3 "$SCRIPT" --repo-root "$REPO_ROOT" \
      --marketplace "$tmp_dir/.claude-plugin/marketplace.json" \
      --skip-sections --skip-versions --skip-descriptions

  rm -rf "$tmp_dir"
}

# 11. Negative / description: a plugin.json description out of sync with its
#     marketplace entry exits non-zero. Check C is the only check that mirrors
#     descriptions; isolate it with the three skip flags so a Check A/B/D pass
#     cannot mask a Check C regression.
test_bad_description_fails() {
  local tmp_dir
  tmp_dir=$(mktemp -d)
  mkdir -p "$tmp_dir/.claude-plugin" "$tmp_dir/plugins/alpha/.claude-plugin"

  printf '{"name":"alpha","version":"1.0.0","description":"Real description","author":{"name":"T"}}\n' \
    > "$tmp_dir/plugins/alpha/.claude-plugin/plugin.json"
  printf '{"name":"t","plugins":[{"name":"alpha","version":"1.0.0","description":"DIFFERENT description","source":"./plugins/alpha"}]}\n' \
    > "$tmp_dir/.claude-plugin/marketplace.json"

  assert_exit "bad-description: non-zero exit for description mismatch" 1 \
    python3 "$SCRIPT" \
      --repo-root "$REPO_ROOT" \
      --check-versions "$tmp_dir/plugins/alpha/.claude-plugin/plugin.json" \
      --marketplace "$tmp_dir/.claude-plugin/marketplace.json" \
      --skip-sections --skip-versions --skip-uniformity

  assert_output_contains \
    "bad-description: output names the mismatch" \
    "description mismatch" \
    python3 "$SCRIPT" \
      --repo-root "$REPO_ROOT" \
      --check-versions "$tmp_dir/plugins/alpha/.claude-plugin/plugin.json" \
      --marketplace "$tmp_dir/.claude-plugin/marketplace.json" \
      --skip-sections --skip-versions --skip-uniformity

  rm -rf "$tmp_dir"
}

# 12. Negative / description: a plugin absent from marketplace.json exits non-zero.
test_missing_description_entry_fails() {
  local tmp_dir
  tmp_dir=$(mktemp -d)
  mkdir -p "$tmp_dir/.claude-plugin" "$tmp_dir/plugins/orphan/.claude-plugin"

  printf '{"name":"orphan","version":"1.0.0","description":"x","author":{"name":"T"}}\n' \
    > "$tmp_dir/plugins/orphan/.claude-plugin/plugin.json"
  printf '{"name":"t","plugins":[{"name":"alpha","version":"1.0.0","description":"x","source":"./plugins/alpha"}]}\n' \
    > "$tmp_dir/.claude-plugin/marketplace.json"

  assert_output_contains \
    "missing-description: output flags plugin absent from marketplace" \
    "not found in marketplace.json" \
    python3 "$SCRIPT" \
      --repo-root "$REPO_ROOT" \
      --check-versions "$tmp_dir/plugins/orphan/.claude-plugin/plugin.json" \
      --marketplace "$tmp_dir/.claude-plugin/marketplace.json" \
      --skip-sections --skip-versions --skip-uniformity

  rm -rf "$tmp_dir"
}

# 13. Positive / description: matching descriptions exit 0.
test_good_description_passes() {
  local tmp_dir
  tmp_dir=$(mktemp -d)
  mkdir -p "$tmp_dir/.claude-plugin" "$tmp_dir/plugins/alpha/.claude-plugin"

  printf '{"name":"alpha","version":"1.0.0","description":"Same description","author":{"name":"T"}}\n' \
    > "$tmp_dir/plugins/alpha/.claude-plugin/plugin.json"
  printf '{"name":"t","plugins":[{"name":"alpha","version":"1.0.0","description":"Same description","source":"./plugins/alpha"}]}\n' \
    > "$tmp_dir/.claude-plugin/marketplace.json"

  assert_exit "good-description: matching descriptions exit 0" 0 \
    python3 "$SCRIPT" \
      --repo-root "$REPO_ROOT" \
      --check-versions "$tmp_dir/plugins/alpha/.claude-plugin/plugin.json" \
      --marketplace "$tmp_dir/.claude-plugin/marketplace.json" \
      --skip-sections --skip-versions --skip-uniformity

  rm -rf "$tmp_dir"
}

# ── run all tests ─────────────────────────────────────────────────────────────

test_live_repo_passes
test_live_repo_resolves_refs
test_bad_section_ref_fails
test_bad_section_ref_message
test_bad_version_fails
test_bad_version_message
test_good_section_ref_passes
test_good_version_passes
test_version_uniformity_fails
test_version_uniformity_passes
test_bad_description_fails
test_missing_description_entry_fails
test_good_description_passes

printf '\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
