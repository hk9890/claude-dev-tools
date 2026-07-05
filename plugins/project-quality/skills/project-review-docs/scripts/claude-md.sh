#!/usr/bin/env bash
set -euo pipefail

# claude-md.sh — enforce the 1-line CLAUDE.md contract.
#
# Contract: CLAUDE.md MUST contain exactly `@AGENTS.md` and nothing else
# (a single trailing newline is allowed). Any other content is a bug; it
# belongs in AGENTS.md or a topic doc under docs/. The project-docs skill
# workflows migrate the content before calling `init --rewrite`.
#
# Commands:
#   check                       FAIL if file missing, malformed, or has extra content
#   init                        Create canonical file if missing; no-op if canonical;
#                               ABORT (exit 2) if extra content present — caller must
#                               migrate the content first, then re-run with --rewrite
#   init --rewrite              Destructively overwrite to canonical 1-line file
#                               (use ONLY after migrating extra content to AGENTS.md /
#                               topic docs via the project-docs skill workflow)

USAGE="Usage: claude-md.sh <init [--rewrite] | check> <repo-root>"

die() { echo "ERROR: $*" >&2; exit 1; }

# Canonical content of CLAUDE.md.
CANONICAL_CONTENT=$'@AGENTS.md\n'

# Read file content and strip a single trailing newline (so we can compare
# against the canonical form without being sensitive to the editor adding one).
file_content_normalized() {
  local file="$1"
  local content
  content=$(cat "$file")
  printf '%s' "$content"
}

# Returns 0 if the file is exactly canonical (`@AGENTS.md` plus optional trailing \n).
is_canonical() {
  local file="$1"
  local content
  content=$(file_content_normalized "$file")
  [[ "$content" == "@AGENTS.md" ]]
}

write_canonical() {
  local target="$1"
  local repo_root="$2"
  local tmp
  tmp=$(mktemp "$repo_root/.CLAUDE.md.XXXXXX")
  printf '%s' "$CANONICAL_CONTENT" > "$tmp"
  mv -f "$tmp" "$target"
}

cmd_check() {
  local repo_root="$1"
  local target="$repo_root/CLAUDE.md"

  if [[ ! -f "$target" ]]; then
    echo "MISSING: $target does not exist" >&2
    exit 1
  fi

  if is_canonical "$target"; then
    echo "OK: $target contains exactly @AGENTS.md"
    exit 0
  fi

  # Diagnose the failure mode for a useful message.
  local line_count
  line_count=$(wc -l < "$target" | tr -d ' ')
  local first
  first=$(head -n1 "$target")
  if [[ "$first" != "@AGENTS.md" ]]; then
    echo "INVALID: $target first line is not @AGENTS.md (got: ${first:-<empty>})" >&2
  else
    echo "INVALID: $target has extra content beyond @AGENTS.md (${line_count} line(s) total)" >&2
    echo "        CLAUDE.md must be exactly one line. Migrate extra content to AGENTS.md" >&2
    echo "        or a topic doc under docs/, then collapse via the project-docs skill." >&2
  fi
  exit 1
}

cmd_init() {
  local repo_root="$1"
  local rewrite="$2"
  local target="$repo_root/CLAUDE.md"

  # State 1: Missing — create canonical
  if [[ ! -f "$target" ]]; then
    write_canonical "$target" "$repo_root"
    echo "CREATED: $target (@AGENTS.md)"
    return
  fi

  # State 2: Already canonical — no-op
  if is_canonical "$target"; then
    echo "OK: $target already canonical; no change"
    return
  fi

  # State 3: Has extra content
  if [[ "$rewrite" -eq 1 ]]; then
    write_canonical "$target" "$repo_root"
    echo "REWROTE: $target collapsed to canonical @AGENTS.md (caller is responsible for migrating prior content)"
    return
  fi

  echo "ABORT: $target has content beyond @AGENTS.md." >&2
  echo "       CLAUDE.md must be exactly one line. Migrate the extra content to" >&2
  echo "       AGENTS.md (for routing) or a topic doc under docs/, then re-run" >&2
  echo "       with --rewrite to collapse the file." >&2
  echo "       In skill workflows: use the docs-init / docs-update / docs-revise" >&2
  echo "       migration step instead of calling --rewrite directly." >&2
  exit 2
}

# ── entrypoint ──────────────────────────────────────────────────────────────

CMD=""
REPO_ROOT=""
REWRITE=0

# Parse args: <cmd> [--rewrite] <repo-root>
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) printf '%s\n' "$USAGE"; exit 0 ;;
    --rewrite) REWRITE=1; shift ;;
    init|check)
      if [[ -n "$CMD" ]]; then die "$USAGE"; fi
      CMD="$1"; shift ;;
    *)
      if [[ -n "$REPO_ROOT" ]]; then die "$USAGE"; fi
      REPO_ROOT="$1"; shift ;;
  esac
done

[[ -n "$CMD" && -n "$REPO_ROOT" ]] || die "$USAGE"
[[ -d "$REPO_ROOT" ]] || die "repo-root '$REPO_ROOT' is not a directory"

if [[ "$REWRITE" -eq 1 && "$CMD" != "init" ]]; then
  die "--rewrite is only valid with 'init'"
fi

case "$CMD" in
  init)  cmd_init  "$REPO_ROOT" "$REWRITE" ;;
  check) cmd_check "$REPO_ROOT" ;;
  *)     die "Unknown command '$CMD'. $USAGE" ;;
esac
