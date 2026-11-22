#!/usr/bin/env bash
# The maintainer's private folder is a setting of one machine. The plugins read the name a
# user picks from that user's CLAUDE.local.md import, so no file here may name it. The
# pattern is split so that this file does not match itself.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

NAME="hako""-private"
if hits=$(git -C "$REPO_ROOT" grep -n -I --untracked --exclude-standard -F "$NAME"); then
  echo "FAIL: $NAME is named in the repository:"
  echo "$hits"
  echo ""
  echo "Results: 0 passed, 1 failed"
  exit 1
fi
echo "PASS: no file names $NAME"
echo ""
echo "Results: 1 passed, 0 failed"
