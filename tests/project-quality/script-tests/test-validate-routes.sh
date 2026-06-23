#!/usr/bin/env bash
# test-validate-routes.sh — fixture-based smoke tests for validate-routes.py
#
# Covers:
#   - pass: all references resolve
#   - fail: broken file link exits non-zero
#   - fail: broken anchor exits non-zero
#   - pass: duplicate heading anchors with -1/-2 suffixes
#   - ignore: @-imports inside fenced code blocks
#   - ignore: @-imports inside inline code
#   - ignore: @ in prose (e.g., user@example.com)
#   - ignore: external URLs (http/https)
#   - ignore: plugin:skill opaque references
#   - pass: --include-docs extends validation to docs/*.md
#   - misc: no args → exit 1; bad dir → exit 1
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/project-quality/skills/project-review-docs/scripts/validate-routes.py"

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

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if printf '%s' "$haystack" | grep -qF "$needle"; then
    ok "$label"
  else
    fail "$label — expected to contain $(printf '%q' "$needle")"
  fi
}

assert_not_contains() {
  local label="$1" needle="$2" haystack="$3"
  if ! printf '%s' "$haystack" | grep -qF "$needle"; then
    ok "$label"
  else
    fail "$label — expected NOT to contain $(printf '%q' "$needle")"
  fi
}

# ── fixture helpers ───────────────────────────────────────────────────────────

tmpdir() { mktemp -d; }

make_base_repo() {
  # Creates a minimal repo with CLAUDE.md → @AGENTS.md and an AGENTS.md
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  printf '# Agents\n\nNo links here.\n' > "$dir/AGENTS.md"
  echo "$dir"
}

# ── test cases ────────────────────────────────────────────────────────────────

# 1. No args → exit 1
test_no_args() {
  assert_exit "no-args: exit 1" 1 python3 "$SCRIPT"
}

# 2. Non-existent directory → exit 1
test_bad_dir() {
  assert_exit "bad-dir: exit 1" 1 python3 "$SCRIPT" /nonexistent/path/xyz99
}

# 3. @AGENTS.md in CLAUDE.md resolves cleanly → exit 0
test_at_import_resolves() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  printf '# Agents\n' > "$dir/AGENTS.md"
  assert_exit "at-import: resolves @AGENTS.md" 0 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 4. @-import pointing to a missing file → exit 1
test_at_import_missing() {
  local dir; dir=$(tmpdir)
  printf '@does-not-exist.md\n' > "$dir/CLAUDE.md"
  touch "$dir/AGENTS.md"
  assert_exit "at-import-missing: exit 1" 1 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 5. Inline markdown link resolves → exit 0
test_inline_link_resolves() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  mkdir -p "$dir/docs"
  printf '# Ref\n\n[OVERVIEW](docs/OVERVIEW.md)\n' > "$dir/AGENTS.md"
  printf '# Overview\n' > "$dir/docs/OVERVIEW.md"
  assert_exit "inline-link: resolves docs/OVERVIEW.md" 0 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 6. Broken inline link → exit 1, output mentions the bad ref
test_inline_link_broken() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  printf '# Agents\n\n[bad](does/not/exist.md)\n' > "$dir/AGENTS.md"
  local out; out=$(python3 "$SCRIPT" "$dir" 2>&1) || true
  local code=0; python3 "$SCRIPT" "$dir" >/dev/null 2>&1 || code=$?
  if [[ "$code" -ne 0 ]]; then
    ok "broken-link: exit non-zero"
  else
    fail "broken-link: expected non-zero exit"
  fi
  assert_contains "broken-link: output mentions broken path" "does/not/exist.md" "$out"
  rm -rf "$dir"
}

# 7. Anchor validation: valid anchor → exit 0
test_anchor_valid() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  mkdir -p "$dir/docs"
  printf '# Agents\n\n[Link](docs/target.md#my-section)\n' > "$dir/AGENTS.md"
  printf '# My Section\n\nContent here.\n' > "$dir/docs/target.md"
  assert_exit "anchor-valid: resolves #my-section" 0 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 8. Anchor validation: invalid anchor → exit 1
test_anchor_invalid() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  printf '# Agents\n\n[Link](target.md#nonexistent-heading)\n' > "$dir/AGENTS.md"
  printf '# Real Heading\n\nContent.\n' > "$dir/target.md"
  assert_exit "anchor-invalid: exit 1 for bad anchor" 1 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 9. Duplicate heading slugs: -1/-2 suffixes work correctly
test_duplicate_heading_anchors() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  mkdir -p "$dir/docs"
  # target.md has three headings all named "Section" → slugs: section, section-1, section-2
  printf '# Section\n\nContent A.\n\n# Section\n\nContent B.\n\n# Section\n\nContent C.\n' \
    > "$dir/docs/target.md"
  # AGENTS.md links to all three variants
  printf '# Agents\n\n[A](docs/target.md#section)\n[B](docs/target.md#section-1)\n[C](docs/target.md#section-2)\n' \
    > "$dir/AGENTS.md"
  assert_exit "duplicate-anchors: section, section-1, section-2 all resolve" 0 \
    python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 10. @ inside a fenced code block → NOT flagged
test_at_in_fenced_block() {
  local dir; dir=$(tmpdir)
  # AGENTS.md contains a fenced block with @made-up.md — should not be flagged
  {
    printf '# Agents\n\nNormal content.\n\n'
    printf '```\n@made-up.md\n```\n\nMore content.\n'
  } > "$dir/AGENTS.md"
  touch "$dir/CLAUDE.md"
  assert_exit "at-fenced-block: @made-up.md inside backtick-fence not flagged" 0 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 11. @ inside inline code → NOT flagged
test_at_in_inline_code() {
  local dir; dir=$(tmpdir)
  # A line containing `@made-up.md` in inline code — not a directive
  printf '# Agents\n\nUse `@made-up.md` as an example.\n' > "$dir/AGENTS.md"
  touch "$dir/CLAUDE.md"
  assert_exit "at-inline-code: \`@made-up.md\` not flagged" 0 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 12. @ in prose (e.g., user@example.com) → NOT flagged
test_at_in_prose() {
  local dir; dir=$(tmpdir)
  printf '# Agents\n\nContact email user@example.com here.\n' > "$dir/AGENTS.md"
  touch "$dir/CLAUDE.md"
  assert_exit "at-prose: user@example.com not flagged" 0 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 13. External URLs skipped without flagging
test_external_urls_skipped() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  printf '# Agents\n\n[Beads](https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md)\n' \
    > "$dir/AGENTS.md"
  assert_exit "external-url: https:// link not flagged" 0 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 14. plugin:skill opaque ref skipped without flagging
test_skill_ref_skipped() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  printf '# Agents\n\nLoad [beads-tasks:beads-core](beads-tasks:beads-core) here.\n' \
    > "$dir/AGENTS.md"
  assert_exit "skill-ref: beads-tasks:beads-core not flagged" 0 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 15. --include-docs extends validation to docs/*.md
test_include_docs() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  touch "$dir/AGENTS.md"
  mkdir -p "$dir/docs"
  # docs/OVERVIEW.md has a broken link
  printf '# Overview\n\n[bad](broken/file.md)\n' > "$dir/docs/OVERVIEW.md"
  # Without --include-docs, should pass
  assert_exit "include-docs: without flag exit 0" 0 python3 "$SCRIPT" "$dir"
  # With --include-docs, should fail
  assert_exit "include-docs: with flag exit 1 for broken docs link" 1 \
    python3 "$SCRIPT" "$dir" --include-docs
  rm -rf "$dir"
}

# 16. --json outputs valid JSON with expected structure
test_json_output() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  printf '# Agents\n\n[bad](missing.md)\n' > "$dir/AGENTS.md"
  local out code=0
  out=$(python3 "$SCRIPT" "$dir" --json 2>&1) || code=$?
  if python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
assert 'unresolved' in d
assert 'summary' in d
assert 'checked' in d['summary']
assert 'unresolved' in d['summary']
assert d['summary']['unresolved'] > 0
" <<< "$out" 2>/dev/null; then
    ok "json-output: valid JSON with unresolved entry"
  else
    fail "json-output: invalid JSON or missing fields"
  fi
  rm -rf "$dir"
}

# 17. Markdown link inside a fenced code block → NOT flagged
test_link_in_fenced_block() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  {
    printf '# Agents\n\n'
    printf '```markdown\n[broken](does/not/exist.md)\n```\n\nReal content.\n'
  } > "$dir/AGENTS.md"
  assert_exit "link-fenced-block: link inside backtick-fence not flagged" 0 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 18. ~~~ fenced block also ignored
test_at_in_tilde_fence() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  {
    printf '# Agents\n\n'
    printf '~~~\n@nonexistent.md\n[also broken](nope.md)\n~~~\n\nNormal.\n'
  } > "$dir/AGENTS.md"
  assert_exit "tilde-fence: refs inside ~~~ not flagged" 0 python3 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 19. Nothing-to-check: empty CLAUDE.md/AGENTS.md emits explicit message
#     (prevents false reassurance from a silent "all 0 references resolved")
test_nothing_to_check_message() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  printf '# Agents\n\nNo links at all.\n' > "$dir/AGENTS.md"
  local out
  out=$(python3 "$SCRIPT" "$dir" 2>&1)

  # Exit code stays 0 — same as "all references resolved"
  assert_exit "nothing-to-check: exit 0" 0 python3 "$SCRIPT" "$dir"

  # But output must say so explicitly, not just "All N resolved OK"
  assert_contains "nothing-to-check: explicit message" "No references found" "$out"
  assert_not_contains "nothing-to-check: does NOT claim resolved" "All 0 reference" "$out"

  rm -rf "$dir"
}

# 20. Nothing-to-check: scanned-files context shown so author knows what was checked
test_nothing_to_check_scanned_context() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  printf '# Agents\nNo links.\n' > "$dir/AGENTS.md"
  local out
  out=$(python3 "$SCRIPT" "$dir" 2>&1)

  assert_contains "nothing-to-check: CLAUDE.md mentioned" "CLAUDE.md" "$out"
  assert_contains "nothing-to-check: AGENTS.md mentioned" "AGENTS.md" "$out"

  rm -rf "$dir"
}

# 21. Nothing-to-check with --include-docs: docs/ presence reflected in message
test_nothing_to_check_include_docs() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  printf '# Agents\nNo links.\n' > "$dir/AGENTS.md"
  mkdir -p "$dir/docs"
  printf '# Overview\nNo links here either.\n' > "$dir/docs/OVERVIEW.md"
  printf '# Coding\nAlso none.\n' > "$dir/docs/CODING.md"
  local out
  out=$(python3 "$SCRIPT" "$dir" --include-docs 2>&1)

  assert_contains "nothing-to-check-docs: 'No references found'" "No references found" "$out"
  assert_contains "nothing-to-check-docs: docs/ count shown" "docs/ (2 .md file(s)" "$out"

  rm -rf "$dir"
}

# 22. Nothing-to-check with --include-docs and no docs/ dir
test_nothing_to_check_no_docs_dir() {
  local dir; dir=$(tmpdir)
  touch "$dir/CLAUDE.md"
  printf '# Agents\n' > "$dir/AGENTS.md"
  local out
  out=$(python3 "$SCRIPT" "$dir" --include-docs 2>&1)

  assert_contains "nothing-to-check-no-docs: 'docs/ (missing)'" "docs/ (missing)" "$out"

  rm -rf "$dir"
}

# ── run all tests ─────────────────────────────────────────────────────────────

test_no_args
test_bad_dir
test_at_import_resolves
test_at_import_missing
test_inline_link_resolves
test_inline_link_broken
test_anchor_valid
test_anchor_invalid
test_duplicate_heading_anchors
test_at_in_fenced_block
test_at_in_inline_code
test_at_in_prose
test_external_urls_skipped
test_skill_ref_skipped
test_include_docs
test_json_output
test_link_in_fenced_block
test_at_in_tilde_fence
test_nothing_to_check_message
test_nothing_to_check_scanned_context
test_nothing_to_check_include_docs
test_nothing_to_check_no_docs_dir

printf '\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
