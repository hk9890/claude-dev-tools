#!/usr/bin/env bash
set -euo pipefail

USAGE="Usage: claude-md.sh <init|check> <repo-root>"

die() { echo "ERROR: $*" >&2; exit 1; }

# Return the first non-empty (non-whitespace-only) line of a file, or empty string.
first_nonempty_line() {
  local file="$1"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ -n "${line// /}" ]]; then
      # Strip all whitespace variants (tabs etc.) for the check
      local stripped
      stripped=$(printf '%s' "$line" | tr -d '[:space:]')
      if [[ -n "$stripped" ]]; then
        printf '%s\n' "$line"
        return
      fi
    fi
  done < "$file"
}

cmd_check() {
  local repo_root="$1"
  local target="$repo_root/CLAUDE.md"

  if [[ ! -f "$target" ]]; then
    echo "MISSING: $target does not exist" >&2
    exit 1
  fi

  local first
  first=$(first_nonempty_line "$target")
  if [[ "$first" == "@AGENTS.md" ]]; then
    echo "OK: first non-empty line of $target is @AGENTS.md"
    exit 0
  else
    echo "INVALID: first non-empty line of $target is not @AGENTS.md (got: ${first:-<empty>})" >&2
    exit 1
  fi
}

cmd_init() {
  local repo_root="$1"
  local target="$repo_root/CLAUDE.md"

  # State 1: Missing — create with @AGENTS.md + trailing newline
  if [[ ! -f "$target" ]]; then
    local tmp
    tmp=$(mktemp "$repo_root/.CLAUDE.md.XXXXXX")
    printf '@AGENTS.md\n' > "$tmp"
    mv -f "$tmp" "$target"
    echo "CREATED: $target with @AGENTS.md as first line"
    return
  fi

  # State 2: Exists — check first non-empty line
  local first
  first=$(first_nonempty_line "$target")
  if [[ "$first" == "@AGENTS.md" ]]; then
    echo "OK: $target already has @AGENTS.md as first non-empty line; no change"
    return
  fi

  # State 3: Exists but first non-empty line is not @AGENTS.md — prepend
  local tmp
  tmp=$(mktemp "$repo_root/.CLAUDE.md.XXXXXX")
  {
    printf '@AGENTS.md\n'
    printf '\n'
    cat "$target"
  } > "$tmp"
  mv -f "$tmp" "$target"
  echo "REPAIRED: prepended @AGENTS.md to $target"
}

# ── entrypoint ──────────────────────────────────────────────────────────────
[[ $# -eq 2 ]] || die "$USAGE"

CMD="$1"
REPO_ROOT="$2"

[[ -d "$REPO_ROOT" ]] || die "repo-root '$REPO_ROOT' is not a directory"

case "$CMD" in
  init)  cmd_init  "$REPO_ROOT" ;;
  check) cmd_check "$REPO_ROOT" ;;
  *)     die "Unknown command '$CMD'. $USAGE" ;;
esac
