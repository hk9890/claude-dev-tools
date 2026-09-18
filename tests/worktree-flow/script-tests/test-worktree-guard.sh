#!/usr/bin/env bash
# test-worktree-guard.sh — deny/allow decisions of bin/worktree-guard.
#
# The guard reads a PreToolUse payload on stdin and prints a deny decision, or nothing to allow.

set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/plugins/worktree-flow/bin/worktree-guard"

[[ -x "$SCRIPT" ]] || { echo "FAIL: $SCRIPT is not executable"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "FAIL: jq not on PATH"; exit 1; }

failures=0

decision_for() {
  jq -cn --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}' \
    | "$SCRIPT" \
    | jq -r '.hookSpecificOutput.permissionDecision // empty'
}

expect() {
  local want="$1" cmd="$2" got
  got="$(decision_for "$cmd")"
  [[ -z "$got" ]] && got="allow"
  if [[ "$got" == "$want" ]]; then
    echo "PASS: $want: $cmd"
  else
    echo "FAIL: want $want, got $got: $cmd"
    failures=$((failures + 1))
  fi
}

expect deny  'git worktree add ../feature -b feature'
expect deny  'git -C /home/me/repo worktree add .claude/worktrees/x'
expect deny  'cd repo && git worktree add ../x'
expect deny  'git worktree add'
expect allow 'git worktree list'
expect allow 'git worktree remove .claude/worktrees/x'
expect allow 'git worktree prune'
expect allow 'git worktree add --detach /tmp/probe HEAD'
expect allow 'git worktree add --detach "$(mktemp -d)" HEAD'
expect allow 'echo git; worktree add'
expect allow 'grep -n "worktree add" docs/CHANGE-WORKFLOW.md'
expect allow 'ls .git/worktrees'
expect allow 'git commit -m "use git worktree add here"'
expect allow 'gh pr create --body "blocks git worktree add now"'
expect deny  'git worktree add ../x && ls /tmp/'
expect deny  'git worktree add ../x-scratchpad-feature'
expect deny  $'echo start\ngit worktree add ../x'
expect deny  'result=$(git worktree add ../x)'
expect deny  'git -c core.x=y --no-pager worktree add ../x'

out="$(printf 'not json' | "$SCRIPT")"; rc=$?
if [[ $rc -eq 0 && -z "$out" ]]; then
  echo "PASS: malformed payload fails open"
else
  echo "FAIL: malformed payload: rc=$rc out=$out"
  failures=$((failures + 1))
fi

[[ $failures -eq 0 ]] || { echo "$failures failure(s)"; exit 1; }
echo "all passed"
