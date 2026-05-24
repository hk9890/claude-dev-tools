#!/usr/bin/env bash
# check-gate2-evidence.sh — Release-time audit for gate 2 (plugin-validator) evidence.
#
# For every PR merged since a given base tag/ref whose merged commits touch
# validator-checked plugin surfaces (.claude-plugin/plugin.json, agents/, skills/,
# commands/, hooks/ under any plugins/* subtree), this script looks up the linked
# beads bead ID and verifies that the bead carries a `gate2:passed` or `gate2:n/a`
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
#   2  A dependency (gh or bd) is unavailable.
#
# Per-PR output:
#   PASS  PR #N (bd: <id>): gate2 evidence found
#   FAIL  PR #N (bd: <id>): no gate2:passed or gate2:n/a comment found
#   SKIP  PR #N (no validator-checked files): not required
#   WARN  PR #N: no linked bead ID found — cannot verify; review manually
#
# Environment:
#   REPO_ROOT  Override the repository root (default: git rev-parse --show-toplevel)

set -uo pipefail

# ── dependency checks ──────────────────────────────────────────────────────────

if ! command -v gh >/dev/null 2>&1; then
  printf 'ERROR: gh (GitHub CLI) is not installed or not on PATH.\n' >&2
  printf 'Install it from https://cli.github.com and authenticate with "gh auth login".\n' >&2
  exit 2
fi

if ! command -v bd >/dev/null 2>&1; then
  printf 'ERROR: bd (beads CLI) is not installed or not on PATH.\n' >&2
  printf 'Install the beads-tasks plugin to get bd.\n' >&2
  exit 2
fi

# ── configuration ──────────────────────────────────────────────────────────────

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
if [[ -z "$REPO_ROOT" ]]; then
  printf 'ERROR: not inside a git repository.\n' >&2
  exit 2
fi

# Determine base ref
if [[ $# -ge 1 ]]; then
  BASE_REF="$1"
else
  # Try most recent annotated tag
  BASE_REF=$(git -C "$REPO_ROOT" describe --abbrev=0 --tags 2>/dev/null || true)
  if [[ -z "$BASE_REF" ]]; then
    BASE_REF="HEAD~50"
    printf 'INFO: No annotated tag found; using HEAD~50 as base ref.\n'
  else
    printf 'INFO: Using most recent tag as base ref: %s\n' "$BASE_REF"
  fi
fi

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

# Returns 0 if any of the VALIDATOR_PATHS match files in the given diff range
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

# Extract beads ID from a PR body string (stdin) or a commit message (stdin)
# Accepts forms:
#   Closes claude-dev-tools-<id>[.,]?
#   Closes <id>[.,]?   (where id contains alphanum, -, .)
# Returns the normalised bare ID (e.g. "sjn.2", "ar2", "d2m")
extract_bead_id() {
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

# Check whether a beads bead has a gate2:passed or gate2:n/a comment
# Returns 0 if evidence found, 1 if not found, 2 if bd lookup failed
check_gate2_comment() {
  local bead_id="$1"
  local output
  if ! output=$(bd comments "$bead_id" 2>&1); then
    return 2
  fi
  if printf '%s' "$output" | grep -qE 'gate2:(passed|n/a)'; then
    return 0
  fi
  return 1
}

# ── main ───────────────────────────────────────────────────────────────────────

printf '\nGate 2 evidence audit: %s..HEAD\n' "$BASE_REF"
printf '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n'

# Collect merge commits in the range
mapfile -t MERGE_COMMITS < <(
  git -C "$REPO_ROOT" log --merges --format="%H %s" "${BASE_REF}..HEAD" 2>/dev/null
)

if [[ "${#MERGE_COMMITS[@]}" -eq 0 ]]; then
  printf 'No merge commits found in range %s..HEAD.\n' "$BASE_REF"
  printf '\nAudit result: PASS (no PRs to check)\n'
  exit 0
fi

FAIL_COUNT=0
WARN_COUNT=0
PASS_COUNT=0
SKIP_COUNT=0

for entry in "${MERGE_COMMITS[@]}"; do
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
    SKIP_COUNT=$((SKIP_COUNT + 1))
    continue
  fi

  # PR touches validator surface — must have gate2 evidence
  # Try to extract bead ID from the PR body
  bead_id=""
  if [[ -n "$pr_num" ]]; then
    pr_body=$(gh pr view "$pr_num" --json body -q '.body' 2>/dev/null || true)
    if [[ -n "$pr_body" ]]; then
      bead_id=$(extract_bead_id "$pr_body")
    fi
  fi

  # Fallback: scan commit message of the merge commit itself
  if [[ -z "$bead_id" ]]; then
    commit_msg=$(git -C "$REPO_ROOT" log -1 --format="%B" "$sha" 2>/dev/null || true)
    bead_id=$(extract_bead_id "$commit_msg")
  fi

  if [[ -z "$bead_id" ]]; then
    printf 'WARN  %s: no linked bead ID found — verify gate2 manually\n' "$label"
    WARN_COUNT=$((WARN_COUNT + 1))
    continue
  fi

  label="PR #${pr_num:-?} (bd: ${bead_id})"

  rc=0
  check_gate2_comment "$bead_id" || rc=$?

  case "$rc" in
    0)
      printf 'PASS  %s: gate2 evidence found\n' "$label"
      PASS_COUNT=$((PASS_COUNT + 1))
      ;;
    1)
      printf 'FAIL  %s: no gate2:passed or gate2:n/a comment on bead\n' "$label"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
    2)
      printf 'WARN  %s: bd lookup failed — cannot verify gate2 evidence\n' "$label"
      WARN_COUNT=$((WARN_COUNT + 1))
      ;;
  esac
done

printf '\n'
printf '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
printf 'Summary: %d pass, %d fail, %d skip (no validator surface), %d warn (no bead)\n' \
  "$PASS_COUNT" "$FAIL_COUNT" "$SKIP_COUNT" "$WARN_COUNT"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  printf '\nAudit result: FAIL — %d PR(s) missing gate2 evidence. Block the release.\n' \
    "$FAIL_COUNT"
  exit 1
fi

printf '\nAudit result: PASS\n'
exit 0
