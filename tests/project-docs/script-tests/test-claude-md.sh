#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/project-docs/skills/project-docs/scripts/claude-md.sh"

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

# Read first non-empty (non-whitespace-only) line from a file
first_nonempty() {
  local file="$1"
  while IFS= read -r line || [[ -n "$line" ]]; do
    local stripped
    stripped=$(printf '%s' "$line" | tr -d '[:space:]')
    if [[ -n "$stripped" ]]; then
      printf '%s\n' "$line"
      return
    fi
  done < "$file"
}

# ── tests ─────────────────────────────────────────────────────────────────────

# 1. Missing file — init creates CLAUDE.md with @AGENTS.md
test_missing_file() {
  local dir; dir=$(tmpdir)
  "$SCRIPT" init "$dir"
  if [[ ! -f "$dir/CLAUDE.md" ]]; then
    fail "missing-file: CLAUDE.md was not created"
    rm -rf "$dir"; return
  fi
  local first; first=$(first_nonempty "$dir/CLAUDE.md")
  assert_eq "missing-file: first non-empty line" "@AGENTS.md" "$first"
  rm -rf "$dir"
}

# 2. Already-correct — init with @AGENTS.md as first non-empty line makes no change
test_already_correct() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n\nSome content\n' > "$dir/CLAUDE.md"
  local before; before=$(cat "$dir/CLAUDE.md")
  "$SCRIPT" init "$dir"
  local after; after=$(cat "$dir/CLAUDE.md")
  assert_eq "already-correct: file unchanged" "$before" "$after"
  rm -rf "$dir"
}

# 3. Exists with content only (no @AGENTS.md) — init prepends @AGENTS.md
test_exists_content_only() {
  local dir; dir=$(tmpdir)
  printf 'Some existing content\nMore content\n' > "$dir/CLAUDE.md"
  "$SCRIPT" init "$dir"
  local first; first=$(first_nonempty "$dir/CLAUDE.md")
  assert_eq "exists-content-only: first non-empty line" "@AGENTS.md" "$first"
  # Verify original content is preserved
  if grep -q "Some existing content" "$dir/CLAUDE.md"; then
    ok "exists-content-only: original content preserved"
  else
    fail "exists-content-only: original content was lost"
  fi
  rm -rf "$dir"
}

# 4. Exists with @AGENTS.md in the middle (not first) — init prepends without removing existing
test_agents_in_middle() {
  local dir; dir=$(tmpdir)
  printf 'First line\n@AGENTS.md\nThird line\n' > "$dir/CLAUDE.md"
  "$SCRIPT" init "$dir"
  local first; first=$(first_nonempty "$dir/CLAUDE.md")
  assert_eq "agents-in-middle: first non-empty line" "@AGENTS.md" "$first"
  # The existing @AGENTS.md line must still be present (not removed or moved)
  local count; count=$(grep -c "^@AGENTS.md$" "$dir/CLAUDE.md")
  if [[ "$count" -ge 2 ]]; then
    ok "agents-in-middle: original @AGENTS.md line retained (count=$count)"
  else
    fail "agents-in-middle: expected at least 2 @AGENTS.md lines, got $count"
  fi
  if grep -q "First line" "$dir/CLAUDE.md"; then
    ok "agents-in-middle: 'First line' preserved"
  else
    fail "agents-in-middle: 'First line' was removed"
  fi
  rm -rf "$dir"
}

# 5. Exists with leading whitespace-only lines then @AGENTS.md — init makes no change
test_leading_whitespace_then_agents() {
  local dir; dir=$(tmpdir)
  printf '\n   \n\t\n@AGENTS.md\nContent\n' > "$dir/CLAUDE.md"
  local before; before=$(cat "$dir/CLAUDE.md")
  "$SCRIPT" init "$dir"
  local after; after=$(cat "$dir/CLAUDE.md")
  assert_eq "leading-whitespace-then-agents: file unchanged" "$before" "$after"
  rm -rf "$dir"
}

# 6. check passes on valid CLAUDE.md
test_check_pass() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\nContent\n' > "$dir/CLAUDE.md"
  assert_exit "check-pass: exit 0" 0 "$SCRIPT" check "$dir"
  rm -rf "$dir"
}

# 7a. check fails on missing file
test_check_fail_missing() {
  local dir; dir=$(tmpdir)
  assert_exit "check-fail-missing: exit non-zero" 1 "$SCRIPT" check "$dir"
  rm -rf "$dir"
}

# 7b. check fails on malformed CLAUDE.md (first non-empty line is not @AGENTS.md)
test_check_fail_malformed() {
  local dir; dir=$(tmpdir)
  printf 'Wrong first line\n@AGENTS.md\n' > "$dir/CLAUDE.md"
  assert_exit "check-fail-malformed: exit non-zero" 1 "$SCRIPT" check "$dir"
  rm -rf "$dir"
}

# 8. No trailing newline — check and init handle final line without \n terminator
test_no_trailing_newline() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md' > "$dir/CLAUDE.md"   # no trailing newline
  # check must pass
  assert_exit "no-trailing-newline: check exits 0" 0 "$SCRIPT" check "$dir"
  # init must be a no-op (file content unchanged)
  local before; before=$(cat "$dir/CLAUDE.md")
  "$SCRIPT" init "$dir" >/dev/null 2>&1
  local after; after=$(cat "$dir/CLAUDE.md")
  assert_eq "no-trailing-newline: init is a no-op" "$before" "$after"
  rm -rf "$dir"
}

# 9. Atomic write: temp file is in same directory as target
test_atomic_write() {
  local dir; dir=$(tmpdir)
  printf 'Content without agents\n' > "$dir/CLAUDE.md"
  # After init, no temp file should remain
  "$SCRIPT" init "$dir"
  local leftover; leftover=$(find "$dir" -name ".CLAUDE.md.*" 2>/dev/null | wc -l)
  if [[ "$leftover" -eq 0 ]]; then
    ok "atomic-write: no temp files left behind"
  else
    fail "atomic-write: temp file(s) left behind"
  fi
  rm -rf "$dir"
}

# ── run all tests ─────────────────────────────────────────────────────────────

test_missing_file
test_already_correct
test_exists_content_only
test_agents_in_middle
test_leading_whitespace_then_agents
test_check_pass
test_check_fail_missing
test_check_fail_malformed
test_no_trailing_newline
test_atomic_write

echo ""
echo "Results: $PASS passed, $FAIL failed"

[[ "$FAIL" -eq 0 ]] || exit 1
