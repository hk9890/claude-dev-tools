#!/usr/bin/env bash
# test-check-gate2-evidence.sh — tests for scripts/check-gate2-evidence.sh
#
# check-gate2-evidence.sh is the release-blocking gate-2 audit (docs/RELEASING.md
# step 3). These tests exercise its real decision paths, not just the empty range:
#
#   - smoke: script present/executable; empty range (HEAD..HEAD) → PASS, exit 0
#   - unit:  extract_task_id parses each documented PR/commit form
#   - integ: a throwaway git repo + stubbed gh/taskmgr drive every audit verdict
#            SKIP  (merge touches no validator surface)
#            WARN  (validator surface touched but no linked task id)
#            PASS  (linked task carries a gate2:passed/n-a comment)
#            FAIL  (linked task is MISSING gate2 evidence → exit 1, blocks release)
#
# Stubs are placed first on PATH so the suite is deterministic regardless of
# whether real gh/taskmgr are installed.
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/scripts/check-gate2-evidence.sh"

PASS=0
FAIL=0

# ── helpers ───────────────────────────────────────────────────────────────────

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
  local out
  out=$("$@" 2>&1) || true
  if printf '%s' "$out" | grep -qF "$needle"; then
    ok "$label"
  else
    fail "$label — expected output to contain $(printf '%q' "$needle")"
    printf '  actual output:\n%s\n' "$out"
  fi
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    ok "$label"
  else
    fail "$label — expected $(printf '%q' "$expected"), got $(printf '%q' "$actual")"
  fi
}

# ── deterministic gh/taskmgr stubs ────────────────────────────────────────────
# The script only invokes `gh pr view ... -q .body` and `taskmgr show <id>`.
# Both stubs ignore their arguments and echo controllable env-driven output.

STUB_DIR=$(mktemp -d)
cat > "$STUB_DIR/gh" <<'STUB'
#!/usr/bin/env bash
# stub gh: prints $GH_PR_BODY (the PR body the audit greps for a task id).
printf '%s' "${GH_PR_BODY:-}"
STUB
cat > "$STUB_DIR/taskmgr" <<'STUB'
#!/usr/bin/env bash
# stub taskmgr: prints $TASKMGR_OUTPUT and exits $TASKMGR_RC (2 = lookup failure).
printf '%s\n' "${TASKMGR_OUTPUT:-}"
exit "${TASKMGR_RC:-0}"
STUB
chmod +x "$STUB_DIR/gh" "$STUB_DIR/taskmgr"
export PATH="$STUB_DIR:$PATH"

# Build a throwaway git repo containing exactly one no-ff merge commit.
#   $1 = repo-relative path created on the feature branch (decides validator surface)
#   $2 = merge commit subject (decides PR number / task-id linkage)
# Echoes "<repo-dir> <base-sha>"; caller passes base-sha as the audit's base ref.
build_merge_repo() {
  local touch_path="$1" subject="$2"
  local repo; repo=$(mktemp -d)
  git -C "$repo" init -q
  git -C "$repo" config user.email t@example.com
  git -C "$repo" config user.name 'Test'
  git -C "$repo" config commit.gpgsign false
  printf 'init\n' > "$repo/README.md"
  git -C "$repo" add -A
  git -C "$repo" commit -qm 'initial'
  local base def
  base=$(git -C "$repo" rev-parse HEAD)
  def=$(git -C "$repo" branch --show-current)
  git -C "$repo" checkout -q -b feature
  mkdir -p "$repo/$(dirname "$touch_path")"
  printf 'x\n' > "$repo/$touch_path"
  git -C "$repo" add -A
  git -C "$repo" commit -qm 'feature change'
  git -C "$repo" checkout -q "$def"
  git -C "$repo" merge -q --no-ff feature -m "$subject"
  printf '%s %s\n' "$repo" "$base"
}

VALIDATOR_FILE='plugins/myplugin/skills/myskill/SKILL.md'   # matches plugins/*/skills/**
NON_VALIDATOR_FILE='docs/GUIDE.md'                          # matches no validator pattern
PR_SUBJECT='Merge pull request #42 from u/feature'

# ── smoke tests ───────────────────────────────────────────────────────────────

test_script_exists() {
  if [[ -x "$SCRIPT" ]]; then
    ok "script is present and executable"
  else
    fail "script missing or not executable: $SCRIPT"
  fi
}

test_empty_range_exits_0() {
  assert_exit "empty range (HEAD..HEAD): exits 0" 0 bash "$SCRIPT" HEAD
}

test_empty_range_output_pass() {
  assert_output_contains "empty range: output contains PASS" "PASS" bash "$SCRIPT" HEAD
  assert_output_contains "empty range: mentions no merge commits" "No merge commits" \
    bash "$SCRIPT" HEAD
}

# ── unit: extract_task_id (pure helper, loaded by sourcing the script) ─────────
# NOTE: the parser returns the matched id token verbatim — it does NOT strip the
# "claude-dev-tools-" prefix (pinned here as current behavior).
test_extract_task_id_forms() {
  # shellcheck source=/dev/null
  source "$SCRIPT"
  assert_eq "extract: bare id" "abc123" "$(extract_task_id 'Closes abc123')"
  assert_eq "extract: full-prefix form (prefix retained)" \
    "claude-dev-tools-abc123" "$(extract_task_id 'Closes claude-dev-tools-abc123')"
  assert_eq "extract: trailing period stripped" "ar2" "$(extract_task_id 'Closes ar2.')"
  assert_eq "extract: trailing comma + tail text" \
    "claude-dev-tools-d2m" "$(extract_task_id 'Closes claude-dev-tools-d2m, plus notes')"
  assert_eq "extract: dotted id mid-sentence" "sjn.2" "$(extract_task_id 'Some text. Closes sjn.2. Done.')"
  assert_eq "extract: no 'closes' keyword → empty" "" "$(extract_task_id 'Fixes wq6 and more')"
  assert_eq "extract: no task ref → empty" "" "$(extract_task_id 'just a normal message')"
}

# ── integration: the four audit verdicts ──────────────────────────────────────

test_skip_no_validator_surface() {
  local out repo base
  out=$(build_merge_repo "$NON_VALIDATOR_FILE" "$PR_SUBJECT")
  repo="${out%% *}"; base="${out##* }"
  export REPO_ROOT="$repo"
  assert_exit "SKIP: non-validator merge → exit 0" 0 bash "$SCRIPT" "$base"
  assert_output_contains "SKIP: reports no validator-checked files" \
    "no validator-checked files touched" bash "$SCRIPT" "$base"
  unset REPO_ROOT
  rm -rf "$repo"
}

test_warn_no_linked_task() {
  local out repo base
  out=$(build_merge_repo "$VALIDATOR_FILE" "$PR_SUBJECT")
  repo="${out%% *}"; base="${out##* }"
  export REPO_ROOT="$repo" GH_PR_BODY=""        # empty PR body, no "Closes" in subject
  assert_exit "WARN: no task id → exit 0 (not a hard fail)" 0 bash "$SCRIPT" "$base"
  assert_output_contains "WARN: reports missing task id" \
    "no linked task ID found" bash "$SCRIPT" "$base"
  unset REPO_ROOT GH_PR_BODY
  rm -rf "$repo"
}

test_pass_gate2_evidence_present() {
  local out repo base
  out=$(build_merge_repo "$VALIDATOR_FILE" "$PR_SUBJECT")
  repo="${out%% *}"; base="${out##* }"
  export REPO_ROOT="$repo" \
    GH_PR_BODY='Implements the thing. Closes claude-dev-tools-abc123' \
    TASKMGR_OUTPUT='task abc123: comment gate2:passed — validator clean'
  assert_exit "PASS: gate2 evidence present → exit 0" 0 bash "$SCRIPT" "$base"
  assert_output_contains "PASS: reports gate2 evidence found" \
    "gate2 evidence found" bash "$SCRIPT" "$base"
  unset REPO_ROOT GH_PR_BODY TASKMGR_OUTPUT
  rm -rf "$repo"
}

test_fail_gate2_evidence_missing() {
  local out repo base
  out=$(build_merge_repo "$VALIDATOR_FILE" "$PR_SUBJECT")
  repo="${out%% *}"; base="${out##* }"
  export REPO_ROOT="$repo" \
    GH_PR_BODY='Implements the thing. Closes claude-dev-tools-abc123' \
    TASKMGR_OUTPUT='task abc123: no validator evidence here'
  # The release-blocking path: validator surface touched, task linked, NO gate2 comment.
  assert_exit "FAIL: missing gate2 evidence → exit 1 (blocks release)" 1 bash "$SCRIPT" "$base"
  assert_output_contains "FAIL: reports missing gate2 comment" \
    "no gate2:passed or gate2:n/a comment" bash "$SCRIPT" "$base"
  assert_output_contains "FAIL: says block the release" \
    "Block the release" bash "$SCRIPT" "$base"
  unset REPO_ROOT GH_PR_BODY TASKMGR_OUTPUT
  rm -rf "$repo"
}

test_fail_taskmgr_lookup_warns() {
  # taskmgr lookup failure (rc=2) is a WARN, not a FAIL — pinned so a regression
  # that turned it into a silent PASS or a hard FAIL would be caught.
  local out repo base
  out=$(build_merge_repo "$VALIDATOR_FILE" "$PR_SUBJECT")
  repo="${out%% *}"; base="${out##* }"
  export REPO_ROOT="$repo" \
    GH_PR_BODY='Closes claude-dev-tools-abc123' \
    TASKMGR_OUTPUT='' TASKMGR_RC=2
  assert_exit "WARN: taskmgr lookup failure → exit 0" 0 bash "$SCRIPT" "$base"
  assert_output_contains "WARN: reports taskmgr lookup failure" \
    "taskmgr lookup failed" bash "$SCRIPT" "$base"
  unset REPO_ROOT GH_PR_BODY TASKMGR_OUTPUT TASKMGR_RC
  rm -rf "$repo"
}

# ── run ───────────────────────────────────────────────────────────────────────

test_script_exists
test_empty_range_exits_0
test_empty_range_output_pass
test_extract_task_id_forms
test_skip_no_validator_surface
test_warn_no_linked_task
test_pass_gate2_evidence_present
test_fail_gate2_evidence_missing
test_fail_taskmgr_lookup_warns

rm -rf "$STUB_DIR"

printf '\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
