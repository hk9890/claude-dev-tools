#!/usr/bin/env bash
# list-shell-scripts.sh — the tracked-file set `mise run lint` and the CI `shellcheck`
# job both check. Shared here so the two cannot drift apart (CODING.md requires them
# to stay mirrored).
#
# Every tracked *.sh, plus any plugin bin/ script whose shebang names a POSIX-family
# shell. A plain `*.sh` glob misses the latter — keep-awake-linux's bin/keep-awake is
# a bash script with no extension, so CODING.md's promise that plugin bin/ scripts are
# covered went unmet until this existed.
set -uo pipefail

git ls-files '*.sh'

git ls-files 'plugins/*/bin/*' | while IFS= read -r f; do
  if head -n1 "$f" | grep -qE '^#!.*/(env[[:space:]]+)?(bash|sh|dash|ksh|zsh)$'; then
    printf '%s\n' "$f"
  fi
done
