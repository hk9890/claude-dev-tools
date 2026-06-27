#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/project-quality/skills/project-review-docs/scripts/claude-md.sh"

PASS=0
FAIL=0

# ── helpers ──────────────────────────────────────────────────────────────────

tmpdir() { mktemp -d; }

ok() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL=$((FAIL + 1))
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    ok "$label"
  else
    fail "$label — expected $(printf '%q' "$expected"), got $(printf '%q' "$actual")"
  fi
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

# ── tests: cmd_init ──────────────────────────────────────────────────────────

# 1. Missing file — init creates canonical CLAUDE.md (single line: @AGENTS.md)
test_init_creates_canonical() {
  local dir; dir=$(tmpdir)
  "$SCRIPT" init "$dir"
  if [[ ! -f "$dir/CLAUDE.md" ]]; then
    fail "init-creates: CLAUDE.md was not created"
    rm -rf "$dir"; return
  fi
  local content; content=$(cat "$dir/CLAUDE.md")
  assert_eq "init-creates: file is exactly '@AGENTS.md'" "@AGENTS.md" "$content"
  local lines; lines=$(wc -l < "$dir/CLAUDE.md" | tr -d ' ')
  assert_eq "init-creates: file is exactly 1 line" "1" "$lines"
  rm -rf "$dir"
}

# 2. Already canonical — init is a no-op
test_init_canonical_noop() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  local before; before=$(cat "$dir/CLAUDE.md")
  "$SCRIPT" init "$dir"
  local after; after=$(cat "$dir/CLAUDE.md")
  assert_eq "init-canonical: file unchanged" "$before" "$after"
  rm -rf "$dir"
}

# 3. Has extra content — init ABORTS (exit 2) and leaves file untouched
test_init_extra_content_aborts() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n\n# Local notes\nSome content\n' > "$dir/CLAUDE.md"
  local before; before=$(cat "$dir/CLAUDE.md")

  assert_exit "init-extra-aborts: exit 2 (refuses to clobber)" 2 "$SCRIPT" init "$dir"

  local after; after=$(cat "$dir/CLAUDE.md")
  assert_eq "init-extra-aborts: file untouched on abort" "$before" "$after"
  rm -rf "$dir"
}

# 4. Abort message names the migration path
test_init_extra_content_message() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\nextra\n' > "$dir/CLAUDE.md"
  local out code=0
  out=$("$SCRIPT" init "$dir" 2>&1) || code=$?
  assert_eq "init-extra-msg: exit 2" "2" "$code"
  assert_contains "init-extra-msg: mentions migration target AGENTS.md" "AGENTS.md" "$out"
  # Avoid passing a leading-dash needle to grep — match surrounding text instead
  assert_contains "init-extra-msg: tells caller to re-run with --rewrite" "re-run" "$out"
  rm -rf "$dir"
}

# 5. Wrong-first-line — init ABORTS (extra content takes precedence over prepend)
test_init_wrong_first_line_aborts() {
  local dir; dir=$(tmpdir)
  printf 'Some existing content\n' > "$dir/CLAUDE.md"
  local before; before=$(cat "$dir/CLAUDE.md")

  assert_exit "init-wrong-first: exit 2" 2 "$SCRIPT" init "$dir"

  local after; after=$(cat "$dir/CLAUDE.md")
  assert_eq "init-wrong-first: file untouched on abort" "$before" "$after"
  rm -rf "$dir"
}

# 6. init --rewrite collapses non-canonical file destructively
test_init_rewrite_collapses() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n\n## Old handbook content\nLine A\nLine B\n' > "$dir/CLAUDE.md"

  "$SCRIPT" init --rewrite "$dir" >/dev/null 2>&1

  local content; content=$(cat "$dir/CLAUDE.md")
  assert_eq "init-rewrite: file collapsed to '@AGENTS.md'" "@AGENTS.md" "$content"
  # Old content must be gone
  if grep -q "Old handbook content" "$dir/CLAUDE.md"; then
    fail "init-rewrite: prior content still present (should have been destroyed)"
  else
    ok "init-rewrite: prior content destroyed (as documented)"
  fi
  rm -rf "$dir"
}

# 7. init --rewrite on canonical file is a no-op (still ends canonical)
test_init_rewrite_canonical_noop() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  "$SCRIPT" init --rewrite "$dir" >/dev/null 2>&1
  local content; content=$(cat "$dir/CLAUDE.md")
  assert_eq "init-rewrite-canonical: stays canonical" "@AGENTS.md" "$content"
  rm -rf "$dir"
}

# 8. init --rewrite on missing file creates canonical
test_init_rewrite_missing_creates() {
  local dir; dir=$(tmpdir)
  "$SCRIPT" init --rewrite "$dir" >/dev/null 2>&1
  local content; content=$(cat "$dir/CLAUDE.md")
  assert_eq "init-rewrite-missing: creates canonical" "@AGENTS.md" "$content"
  rm -rf "$dir"
}

# ── tests: cmd_check ─────────────────────────────────────────────────────────

# 9. check passes on canonical CLAUDE.md (with trailing newline)
test_check_pass_canonical() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  assert_exit "check-canonical: exit 0" 0 "$SCRIPT" check "$dir"
  rm -rf "$dir"
}

# 10. check passes without trailing newline
test_check_pass_no_trailing_newline() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md' > "$dir/CLAUDE.md"
  assert_exit "check-no-trailing-nl: exit 0" 0 "$SCRIPT" check "$dir"
  rm -rf "$dir"
}

# 11. check FAILS on missing file
test_check_fail_missing() {
  local dir; dir=$(tmpdir)
  assert_exit "check-missing: exit 1" 1 "$SCRIPT" check "$dir"
  rm -rf "$dir"
}

# 12. check FAILS on wrong first line
test_check_fail_wrong_first() {
  local dir; dir=$(tmpdir)
  printf 'Wrong first\n@AGENTS.md\n' > "$dir/CLAUDE.md"
  local out code=0
  out=$("$SCRIPT" check "$dir" 2>&1) || code=$?
  assert_eq "check-wrong-first: exit 1" "1" "$code"
  assert_contains "check-wrong-first: message names first line" "first line" "$out"
  rm -rf "$dir"
}

# 13. check FAILS on extra content after @AGENTS.md (the regression case)
test_check_fail_extra_content() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n\n# Project Instructions\nSome handbook content here\n' > "$dir/CLAUDE.md"
  local out code=0
  out=$("$SCRIPT" check "$dir" 2>&1) || code=$?
  assert_eq "check-extra-content: exit 1" "1" "$code"
  assert_contains "check-extra-content: message says 'extra content'" "extra content" "$out"
  assert_contains "check-extra-content: message names AGENTS.md migration" "AGENTS.md" "$out"
  rm -rf "$dir"
}

# 14. check FAILS on injected tool-generated block
test_check_fail_injected_block() {
  local dir; dir=$(tmpdir)
  {
    printf '@AGENTS.md\n\n'
    printf '<!-- BEGIN TOOL -->\n'
    printf 'auto content\n'
    printf '<!-- END TOOL -->\n'
  } > "$dir/CLAUDE.md"
  assert_exit "check-injected: exit 1" 1 "$SCRIPT" check "$dir"
  rm -rf "$dir"
}

# ── tests: arg parsing ──────────────────────────────────────────────────────

# 15. No args → exit 1
test_no_args() {
  assert_exit "no-args: exit 1" 1 "$SCRIPT"
}

# 16. Unknown command → exit 1
test_unknown_cmd() {
  local dir; dir=$(tmpdir)
  assert_exit "unknown-cmd: exit 1" 1 "$SCRIPT" bogus "$dir"
  rm -rf "$dir"
}

# 17. --rewrite with 'check' is rejected
test_rewrite_with_check_rejected() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  assert_exit "rewrite-with-check: exit 1" 1 "$SCRIPT" check --rewrite "$dir"
  rm -rf "$dir"
}

# 18. --help prints usage and exits 0
test_help() {
  local out code=0
  out=$("$SCRIPT" --help 2>&1) || code=$?
  assert_eq "help: exit 0" "0" "$code"
  assert_contains "help: shows Usage" "Usage:" "$out"
}

# ── tests: atomic write ─────────────────────────────────────────────────────

# 19. No temp files left behind after any operation
test_atomic_write_no_leftover() {
  local dir; dir=$(tmpdir)
  "$SCRIPT" init "$dir" >/dev/null 2>&1
  "$SCRIPT" init --rewrite "$dir" >/dev/null 2>&1
  local leftover; leftover=$(find "$dir" -name ".CLAUDE.md.*" 2>/dev/null | wc -l)
  if [[ "$leftover" -eq 0 ]]; then
    ok "atomic-write: no temp files left behind"
  else
    fail "atomic-write: $leftover temp file(s) left behind"
  fi
  rm -rf "$dir"
}

# ── run all tests ───────────────────────────────────────────────────────────

test_init_creates_canonical
test_init_canonical_noop
test_init_extra_content_aborts
test_init_extra_content_message
test_init_wrong_first_line_aborts
test_init_rewrite_collapses
test_init_rewrite_canonical_noop
test_init_rewrite_missing_creates
test_check_pass_canonical
test_check_pass_no_trailing_newline
test_check_fail_missing
test_check_fail_wrong_first
test_check_fail_extra_content
test_check_fail_injected_block
test_no_args
test_unknown_cmd
test_rewrite_with_check_rejected
test_help
test_atomic_write_no_leftover

echo ""
echo "Results: $PASS passed, $FAIL failed"

[[ "$FAIL" -eq 0 ]] || exit 1
