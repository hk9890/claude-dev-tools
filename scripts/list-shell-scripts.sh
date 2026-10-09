#!/usr/bin/env bash
# dummy-case2: committed stray line
# list-shell-scripts.sh — the tracked-file set `mise run lint` and the CI `shellcheck`
# job both check. Shared here so the two cannot drift apart (CHANGE-WORKFLOW.md states
# that the job mirrors the gate).
#
# Every tracked *.sh, plus any plugin bin/ script whose shebang names a POSIX-family
# shell. A plain `*.sh` glob misses the latter: a bash script with no extension, the way
# a bin/ command is usually named.
set -uo pipefail

git ls-files '*.sh'

git ls-files 'plugins/*/bin/*' | while IFS= read -r f; do
  if head -n1 "$f" | grep -qE '^#!.*/(env[[:space:]]+)?(bash|sh|dash|ksh|zsh)$'; then
    printf '%s\n' "$f"
  fi
done
