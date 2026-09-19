---
name: worktree-ship
description: "Ship a change from a worktree to an open, reviewed PR, then stop for /worktree-flow:worktree-merge."
user-invocable: true
disable-model-invocation: true
argument-hint: "[change-to-make]"
---

**Ship this change as a reviewed PR:** $ARGUMENTS

With no argument, ask what to change. The run ends at an open PR; merging belongs to `/worktree-flow:worktree-merge`, which the user starts.

## 1. Read the project's change rules

`gh auth status` must succeed; where it fails, stop and tell the user to install `gh` or run `gh auth login`.

Read the project's own workflow (AGENTS.md or CLAUDE.md routing, a change-workflow or contributing doc, `CLAUDE.local.md`) and record: the remote to push to, the branch naming convention, the **gates** a PR needs green plus the setup a fresh checkout needs, and the commit style. Where the project documents a step, its rule replaces the generic one below.

## 2. Enter a worktree

1. `git fetch`. Where the harness setting `worktree.baseRef` is `head` (`.claude/settings.local.json` or `.claude/settings.json`), the worktree branches from local HEAD: fast-forward the default branch first, or the change starts from a stale base.
2. Call `EnterWorktree` with a bare kebab-case name, for example `fix-login` — before starting any subagent: a subagent already running when the session enters a worktree loses its Bash.
3. Run the setup from step 1.

## 3. Implement

Make the change, and add or update the tests that cover it.

## 4. Run the gates

Run every gate. Fix and rerun until all are green. A gate that also fails on the base branch was broken before this change: report it and ask the user. Keep each gate's command and result for the PR body; a gate that cannot run here is reported as skipped, never as passed.

## 5. Commit, push, open the PR

Commit in the project's style. Push with upstream tracking, under the project's branch convention where it has one (`git push -u <remote> HEAD:<branch-name>`). Open the PR with `gh pr create`; the body states what changed and why, and each gate with its result.

## 6. Review and fix

Invoke the `code-review` skill with the argument `xhigh --fix <pr-number>`. It runs in the background: wait for its completion notification, then read which findings it applied. Rerun the gates, commit, push, and bring the gate results in the PR body up to date with `gh pr edit --body`.

Done when the review has finished and its fixes are pushed with every gate green.

## 7. Report and stop

Report the PR URL, the worktree path, each gate with its result, and the review findings applied. Stay in the worktree: `/worktree-flow:worktree-merge` removes it.
