#!/usr/bin/env bash
# check-gate2-evidence.sh — Release-time audit for gate 2 (plugin-validator) evidence.
#
# For every PR merged since a given base tag/ref whose merged commits touch
# validator-checked plugin surfaces (.claude-plugin/plugin.json, agents/, skills/,
# commands/, hooks/ under any plugins/* subtree), this script looks up the linked
# taskmgr task ID and verifies that the task carries a `gate2:passed` or `gate2:n/a`
# comment.
#
# Usage:
#   bash scripts/check-gate2-evidence.sh [<base-ref>]
#
# Arguments:
#   <base-ref>   Git ref to use as the start of the range (exclusive).
#                Defaults to the most recent annotated tag; falls back to HEAD~50
#                if no annotated tag exists.
#
# Exit codes:
#   0  All checked PRs have gate2 evidence (or no PRs needed checking).
#   1  One or more PRs are missing gate2 evidence — release should be blocked.
#   2  A dependency (gh or taskmgr) is unavailable.
#
# Per-PR output:
#   PASS  PR #N (task: <id>): gate2 evidence found
#   FAIL  PR #N (task: <id>): no gate2:passed or gate2:n/a comment found
#   SKIP  PR #N (no validator-checked files): not required
#   WARN  PR #N: no linked task ID found — cannot verify; review manually
#
# Environment:
#   REPO_ROOT  Override the repository root (default: git rev-parse --show-toplevel)
#
# Testability:
#   The pure helpers (extract_task_id, merge_touches_validator_surface,
#   check_gate2_comment) are defined at top level and the imperative audit lives in
#   main(), which runs only when the script is executed directly. Tests can `source`
#   this file to exercise the helpers without triggering the dependency checks or the
#   audit (see tests/marketplace/script-tests/test-check-gate2-evidence.sh).

set -uo pipefail

# ── configuration (constants) ────────────────────────────────────────────────

# Validator-checked glob patterns (paths relative to repo root)
# Matches: .claude-plugin/plugin.json, agents/**, skills/**, commands/**, hooks/**
# under any plugins/* subtree
VALIDATOR_PATHS=(
  'plugins/*/.claude-plugin/plugin.json'
  'plugins/*/agents/**'
  'plugins/*/skills/**'
  'plugins/*/commands/**'
  'plugins/*/hooks/**'
)

# ── helpers ────────────────────────────────────────────────────────────────────

# Returns 0 if any of the VALIDATOR_PATHS match files in the given diff range.
# Reads the REPO_ROOT global (set by main).
merge_touches_validator_surface() {
  local from="$1" to="$2"
  for pattern in "${VALIDATOR_PATHS[@]}"; do
    if git -C "$REPO_ROOT" diff --name-only "$from" "$to" -- "$pattern" 2>/dev/null \
        | grep -q .; then
      return 0
    fi
  done
  return 1
}

# Extract taskmgr task ID from a PR body string (stdin) or a commit message (stdin)
# Accepts forms:
#   Closes claude-dev-tools-<id>[.,]?
#   Closes <id>[.,]?   (where id contains alphanum, -, .)
# Returns the normalised bare ID (e.g. "sjn.2", "ar2", "d2m")
extract_task_id() {
  local text="$1"
  # Try full-prefix form first: claude-dev-tools-<id>
  local id
  id=$(printf '%s' "$text" \
    | grep -oiE 'closes[[:space:]]+(claude-dev-tools-)?[a-z0-9][a-z0-9._-]+' \
    | head -1 \
    | grep -oiE '[a-z0-9][a-z0-9._-]+$' \
    | sed 's/[.,]*$//')
  printf '%s' "$id"
}

# Check whether a taskmgr task has a gate2:passed or gate2:n/a comment
# Returns 0 if evidence found, 1 if not found, 2 if taskmgr lookup failed
check_gate2_comment() {
  local task_id="$1"
  local output
  if ! output=$(taskmgr show "$task_id" 2>&1); then
    return 2
  fi
  if printf '%s' "$output" | grep -qE 'gate2:(passed|n/a)'; then
    return 0
  fi
  return 1
}

# ── main ───────────────────────────────────────────────────────────────────────

main() {
  # ── dependency checks ──────────────────────────────────────────────────────
  if ! command -v gh >/dev/null 2>&1; then
    printf 'ERROR: gh (GitHub CLI) is not installed or not on PATH.\n' >&2
    printf 'Install it from https://cli.github.com and authenticate with "gh auth login".\n' >&2
    exit 2
  fi

  if ! command -v taskmgr >/dev/null 2>&1; then
    printf 'ERROR: taskmgr (task-manager CLI) is not installed or not on PATH.\n' >&2
    printf 'Install taskmgr (see plugins/tasks/README.md) to get the binary.\n' >&2
    exit 2
  fi

  # ── configuration ──────────────────────────────────────────────────────────
  # Assigned without `local` so the helpers (defined above) can read REPO_ROOT.
  REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
  if [[ -z "$REPO_ROOT" ]]; then
    printf 'ERROR: not inside a git repository.\n' >&2
    exit 2
  fi

  # Determine base ref
  local base_ref
  if [[ $# -ge 1 ]]; then
    base_ref="$1"
  else
    # Try most recent annotated tag
    base_ref=$(git -C "$REPO_ROOT" describe --abbrev=0 --tags 2>/dev/null || true)
    if [[ -z "$base_ref" ]]; then
      base_ref="HEAD~50"
      printf 'INFO: No annotated tag found; using HEAD~50 as base ref.\n'
    else
      printf 'INFO: Using most recent tag as base ref: %s\n' "$base_ref"
    fi
  fi

  printf '\nGate 2 evidence audit: %s..HEAD\n' "$base_ref"
  printf '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n'

  # Collect merge commits in the range
  local -a merge_commits
  mapfile -t merge_commits < <(
    git -C "$REPO_ROOT" log --merges --format="%H %s" "${base_ref}..HEAD" 2>/dev/null
  )

  if [[ "${#merge_commits[@]}" -eq 0 ]]; then
    printf 'No merge commits found in range %s..HEAD.\n' "$base_ref"
    printf '\nAudit result: PASS (no PRs to check)\n'
    exit 0
  fi

  local fail_count=0 warn_count=0 pass_count=0 skip_count=0

  local entry sha subject pr_num label task_id pr_body commit_msg rc
  for entry in "${merge_commits[@]}"; do
    sha="${entry%% *}"
    subject="${entry#* }"

    # Extract PR number from merge commit subject "Merge pull request #N from ..."
    pr_num=""
    if [[ "$subject" =~ Merge\ pull\ request\ #([0-9]+) ]]; then
      pr_num="${BASH_REMATCH[1]}"
    fi

    label="PR #${pr_num:-?} (${sha:0:8})"

    # Check if this PR's diff touches validator-checked surfaces
    if ! merge_touches_validator_surface "${sha}^" "${sha}"; then
      printf 'SKIP  %s: no validator-checked files touched\n' "$label"
      skip_count=$((skip_count + 1))
      continue
    fi

    # PR touches validator surface — must have gate2 evidence
    # Try to extract task ID from the PR body
    task_id=""
    if [[ -n "$pr_num" ]]; then
      pr_body=$(gh pr view "$pr_num" --json body -q '.body' 2>/dev/null || true)
      if [[ -n "$pr_body" ]]; then
        task_id=$(extract_task_id "$pr_body")
      fi
    fi

    # Fallback: scan commit message of the merge commit itself
    if [[ -z "$task_id" ]]; then
      commit_msg=$(git -C "$REPO_ROOT" log -1 --format="%B" "$sha" 2>/dev/null || true)
      task_id=$(extract_task_id "$commit_msg")
    fi

    if [[ -z "$task_id" ]]; then
      printf 'WARN  %s: no linked task ID found — verify gate2 manually\n' "$label"
      warn_count=$((warn_count + 1))
      continue
    fi

    label="PR #${pr_num:-?} (task: ${task_id})"

    rc=0
    check_gate2_comment "$task_id" || rc=$?

    case "$rc" in
      0)
        printf 'PASS  %s: gate2 evidence found\n' "$label"
        pass_count=$((pass_count + 1))
        ;;
      1)
        printf 'FAIL  %s: no gate2:passed or gate2:n/a comment on task\n' "$label"
        fail_count=$((fail_count + 1))
        ;;
      2)
        printf 'WARN  %s: taskmgr lookup failed — cannot verify gate2 evidence\n' "$label"
        warn_count=$((warn_count + 1))
        ;;
    esac
  done

  printf '\n'
  printf '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  printf 'Summary: %d pass, %d fail, %d skip (no validator surface), %d warn (no task)\n' \
    "$pass_count" "$fail_count" "$skip_count" "$warn_count"

  if [[ "$fail_count" -gt 0 ]]; then
    printf '\nAudit result: FAIL — %d PR(s) missing gate2 evidence. Block the release.\n' \
      "$fail_count"
    exit 1
  fi

  printf '\nAudit result: PASS\n'
  exit 0
}

# Run the audit only when executed directly. Sourcing (e.g. from the test suite)
# loads the pure helpers above without triggering dependency checks or the audit.
# `${BASH_SOURCE[0]:-}` guards against set -u when the array is unset (non-bash shells).
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
  main "$@"
fi
