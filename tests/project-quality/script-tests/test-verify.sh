#!/usr/bin/env bash
# test-verify.sh — fixture-based smoke tests for verify.sh
#
# Covers:
#   - pass: clean repo (valid CLAUDE.md, valid routes, clean inventory)
#   - fail: malformed CLAUDE.md (hard)
#   - fail: broken route (hard)
#   - both hard checks fail together — still exits non-zero
#   - soft warnings: missing canonical docs do NOT flip exit code
#   - soft warnings: location violation does NOT flip exit code
#   - soft warnings: non-canonical doc does NOT flip exit code
#   - all checks run even when an early hard check fails (no short-circuit)
#   - works from arbitrary CWD
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/project-quality/skills/project-review-docs/scripts/verify.sh"

PASS=0
FAIL=0

# ── helpers ──────────────────────────────────────────────────────────────────

tmpdir() { mktemp -d; }

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

# ── fixture builders ──────────────────────────────────────────────────────────

make_clean_repo() {
  # Minimal clean repo: valid CLAUDE.md, valid AGENTS.md with no links
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  printf '# Agents\n\nNo links here.\n' > "$dir/AGENTS.md"
  echo "$dir"
}

make_malformed_claude_md_repo() {
  # CLAUDE.md first non-empty line is NOT @AGENTS.md
  local dir; dir=$(tmpdir)
  printf 'Wrong first line\n@AGENTS.md\n' > "$dir/CLAUDE.md"
  printf '# Agents\n\nNo links here.\n' > "$dir/AGENTS.md"
  echo "$dir"
}

make_broken_route_repo() {
  # Valid CLAUDE.md but AGENTS.md has a broken link
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  printf '# Agents\n\n[broken](does/not/exist.md)\n' > "$dir/AGENTS.md"
  echo "$dir"
}

# ── tests ─────────────────────────────────────────────────────────────────────

# 1. No args → exit 1
test_no_args() {
  assert_exit "no-args: exit 1" 1 "$SCRIPT"
}

# 2. Non-existent directory → exit 1
test_bad_dir() {
  assert_exit "bad-dir: exit 1" 1 "$SCRIPT" /nonexistent/path/xyz99verify
}

# 3. Clean repo → exit 0
test_clean_pass() {
  local dir; dir=$(make_clean_repo)
  assert_exit "clean-repo: exit 0" 0 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 4. Malformed CLAUDE.md → exit 1
test_malformed_claude_md() {
  local dir; dir=$(make_malformed_claude_md_repo)
  assert_exit "malformed-claude-md: exit 1" 1 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 5. Broken route → exit 1
test_broken_route() {
  local dir; dir=$(make_broken_route_repo)
  assert_exit "broken-route: exit 1" 1 "$SCRIPT" "$dir"
  rm -rf "$dir"
}

# 6. Both hard checks fail → still exit 1 (and both checks ran)
test_both_hard_checks_fail() {
  local dir; dir=$(tmpdir)
  printf 'Not agents\n' > "$dir/CLAUDE.md"
  printf '# Agents\n\n[broken](nope.md)\n' > "$dir/AGENTS.md"
  local out code=0
  out=$("$SCRIPT" "$dir" 2>&1) || code=$?
  if [[ "$code" -ne 0 ]]; then
    ok "both-hard-fail: exit non-zero"
  else
    fail "both-hard-fail: expected non-zero exit"
  fi
  # Both check headers must appear in output (no short-circuit)
  assert_contains "both-hard-fail: check 1 ran" "Check 1" "$out"
  assert_contains "both-hard-fail: check 2 ran" "Check 2" "$out"
  rm -rf "$dir"
}

# 7. Missing canonical docs → soft warning, exit 0
test_soft_warning_missing_canonical() {
  local dir; dir=$(make_clean_repo)
  # No docs/ dir means all canonical docs/ docs are missing
  local out code=0
  out=$("$SCRIPT" "$dir" 2>&1) || code=$?
  if [[ "$code" -eq 0 ]]; then
    ok "soft-missing-canonical: exit 0 (non-fatal)"
  else
    fail "soft-missing-canonical: expected exit 0, got $code"
  fi
  assert_contains "soft-missing-canonical: WARNING emitted" "WARNING" "$out"
  rm -rf "$dir"
}

# 8. Location violation → soft warning, exit 0
test_soft_warning_location_violation() {
  local dir; dir=$(make_clean_repo)
  # Put OVERVIEW.md at root instead of docs/ — location violation
  printf '# Overview\nContent here.\n' > "$dir/OVERVIEW.md"
  local out code=0
  out=$("$SCRIPT" "$dir" 2>&1) || code=$?
  if [[ "$code" -eq 0 ]]; then
    ok "soft-location-violation: exit 0 (non-fatal)"
  else
    fail "soft-location-violation: expected exit 0, got $code"
  fi
  assert_contains "soft-location-violation: WARNING emitted" "WARNING" "$out"
  rm -rf "$dir"
}

# 9. Non-canonical doc in docs/ → soft warning, exit 0
test_soft_warning_non_canonical() {
  local dir; dir=$(make_clean_repo)
  mkdir -p "$dir/docs"
  printf '# Extra\nExtra content.\n' > "$dir/docs/EXTRA.md"
  local out code=0
  out=$("$SCRIPT" "$dir" 2>&1) || code=$?
  if [[ "$code" -eq 0 ]]; then
    ok "soft-non-canonical: exit 0 (non-fatal)"
  else
    fail "soft-non-canonical: expected exit 0, got $code"
  fi
  assert_contains "soft-non-canonical: WARNING emitted" "WARNING" "$out"
  rm -rf "$dir"
}

# 10. All three checks run even when check 1 fails (no short-circuit on set -uo pipefail)
test_no_short_circuit() {
  local dir; dir=$(make_malformed_claude_md_repo)
  local out code=0
  out=$("$SCRIPT" "$dir" 2>&1) || code=$?
  # Check 3 header must appear even though check 1 failed
  assert_contains "no-short-circuit: check 3 ran" "Check 3" "$out"
  assert_contains "no-short-circuit: final summary line present" "VERIFY:" "$out"
  rm -rf "$dir"
}

# 11. Works from arbitrary CWD (invoke with absolute path to verify.sh)
test_arbitrary_cwd() {
  local dir; dir=$(make_clean_repo)
  local code=0
  (cd /tmp && "$SCRIPT" "$dir") >/dev/null 2>&1 || code=$?
  if [[ "$code" -eq 0 ]]; then
    ok "arbitrary-cwd: exit 0 when invoked from /tmp"
  else
    fail "arbitrary-cwd: expected exit 0, got $code"
  fi
  rm -rf "$dir"
}

# 12. Final summary line says PASS on clean repo
test_pass_summary_line() {
  local dir; dir=$(make_clean_repo)
  local out
  out=$("$SCRIPT" "$dir" 2>&1) || true
  assert_contains "pass-summary: 'PASS' in final line" "VERIFY: PASS" "$out"
  rm -rf "$dir"
}

# 13. Final summary line says FAIL on broken repo
test_fail_summary_line() {
  local dir; dir=$(make_malformed_claude_md_repo)
  local out
  out=$("$SCRIPT" "$dir" 2>&1) || true
  assert_contains "fail-summary: 'FAIL' in final line" "VERIFY: FAIL" "$out"
  rm -rf "$dir"
}

# 14. --quick flag: still passes on a clean repo
test_quick_clean_pass() {
  local dir; dir=$(make_clean_repo)
  assert_exit "quick-clean: exit 0" 0 "$SCRIPT" --quick "$dir"
  rm -rf "$dir"
}

# 15. --quick flag: skips docs/ route validation (broken docs/ link → still passes)
test_quick_skips_docs_routes() {
  local dir; dir=$(make_clean_repo)
  mkdir -p "$dir/docs"
  # Broken link inside docs/ — would fail with --include-docs, but --quick omits that
  printf '# Overview\n\n[bad](missing/file.md)\n' > "$dir/docs/OVERVIEW.md"

  # Without --quick: full mode does include docs/ → fails
  assert_exit "quick-vs-full: full mode fails on broken docs/ link" 1 "$SCRIPT" "$dir"
  # With --quick: docs/ skipped → passes
  assert_exit "quick-vs-full: --quick skips docs/ → exit 0" 0 "$SCRIPT" --quick "$dir"

  rm -rf "$dir"
}

# 16. --quick flag: AGENTS.md route still checked (CLAUDE.md + AGENTS.md always validated)
test_quick_still_checks_agents() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  printf '# Agents\n\n[broken](does/not/exist.md)\n' > "$dir/AGENTS.md"
  assert_exit "quick-still-agents: broken AGENTS.md link → exit 1 even with --quick" 1 \
    "$SCRIPT" --quick "$dir"
  rm -rf "$dir"
}

# 17. --help flag prints usage and exits 0
test_help_flag() {
  local out code=0
  out=$("$SCRIPT" --help 2>&1) || code=$?
  if [[ "$code" -eq 0 ]]; then
    ok "help-flag: exit 0"
  else
    fail "help-flag: expected exit 0, got $code"
  fi
  assert_contains "help-flag: shows Usage" "Usage:" "$out"
  # Avoid passing a leading-dash needle to grep — match the help body for --quick instead
  assert_contains "help-flag: documents --quick mode" "Skip docs/*.md route validation" "$out"
}

# 18. Unknown flag → exit 1 with helpful message
test_unknown_flag() {
  local out code=0
  out=$("$SCRIPT" --bogus /tmp 2>&1) || code=$?
  if [[ "$code" -eq 1 ]]; then
    ok "unknown-flag: exit 1"
  else
    fail "unknown-flag: expected exit 1, got $code"
  fi
  assert_contains "unknown-flag: explains unknown option" "Unknown option" "$out"
}

# 19. Injected block in AGENTS.md → soft warning, exit 0
test_soft_warning_injected_block() {
  local dir; dir=$(make_clean_repo)
  # Append an injected block to the clean AGENTS.md
  {
    cat "$dir/AGENTS.md"
    printf '\n<!-- BEGIN MYTOOL -->\nauto-generated\n<!-- END MYTOOL -->\n'
  } > "$dir/AGENTS.md.tmp" && mv "$dir/AGENTS.md.tmp" "$dir/AGENTS.md"

  local out code=0
  out=$("$SCRIPT" "$dir" 2>&1) || code=$?
  if [[ "$code" -eq 0 ]]; then
    ok "soft-injected-block: exit 0 (non-fatal)"
  else
    fail "soft-injected-block: expected exit 0, got $code"
  fi
  assert_contains "soft-injected-block: WARNING emitted" "WARNING: injected block" "$out"
  assert_contains "soft-injected-block: names the block" "MYTOOL" "$out"

  rm -rf "$dir"
}

# ── run all tests ─────────────────────────────────────────────────────────────

test_no_args
test_bad_dir
test_clean_pass
test_malformed_claude_md
test_broken_route
test_both_hard_checks_fail
test_soft_warning_missing_canonical
test_soft_warning_location_violation
test_soft_warning_non_canonical
test_no_short_circuit
test_arbitrary_cwd
test_pass_summary_line
test_fail_summary_line
test_quick_clean_pass
test_quick_skips_docs_routes
test_quick_still_checks_agents
test_help_flag
test_unknown_flag
test_soft_warning_injected_block

printf '\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
