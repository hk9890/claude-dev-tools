---
name: worktree-ship
description: "Ship a change from a fresh worktree to an open, reviewed PR, then stop for /worktree-merge."
user-invocable: true
disable-model-invocation: true
argument-hint: "[change-to-make]"
---

**Ship this change as a reviewed PR:** $ARGUMENTS

With no argument, ask what to change. The run ends at an open PR with a clean review; merging belongs to `/worktree-flow:worktree-merge`, which the user starts.

## 1. Read the project's change rules

`gh auth status` must succeed; where it fails, stop and tell the user to install `gh` or run `gh auth login`.

Read the project's own workflow before touching anything: the AGENTS.md or CLAUDE.md routing, a change-workflow or contributing doc, `CLAUDE.local.md`. Record:

- **Remote** — the remote to push to (`origin` or the user's fork), and for a fork the upstream repository the PR targets. Where the docs name none and `git remote` lists more than one, ask.
- **Branch name** — the naming convention (`feat/`, `fix/`, …).
- **Gates** — the build, test and lint commands a PR needs green, and any setup a fresh checkout needs first (dependency install).
- **Commit style** — the message convention.

Where the project documents a step, its rule replaces the generic one below. Done when all four are recorded, each with the file it came from or "not documented".

## 2. Enter a worktree

Already in a worktree for this change: stay there. Otherwise:

1. `git fetch <remote>`. Where the harness setting `worktree.baseRef` is `head` (`.claude/settings.local.json`, `.claude/settings.json`), the worktree branches from local HEAD, so bring the default branch to the remote tip first: `git merge --ff-only <remote>/<default branch>` where it is checked out, else `git fetch <remote> <default branch>:<default branch>`.
2. Call `EnterWorktree` with a bare kebab-case name for the change, for example `fix-login` — before any file edit and before starting any subagent: a subagent already running when the session enters a worktree loses its Bash. The tool names the branch `worktree-<name>`.
3. Run the setup recorded in step 1.

Done when `git rev-parse --show-toplevel` prints the worktree path.

## 3. Implement

Make the change, and add or update the tests that cover it. Done when both are written.

## 4. Run the gates

Run every gate recorded in step 1. Fix and rerun until all are green. Keep the command and result of each: the PR body quotes them. A gate that cannot run here (missing tool, missing credential) is reported as skipped, never as passed.

## 5. Commit, push, open the PR

1. Commit in the project's style — one logical change per commit.
2. Push with upstream tracking. Where the project has a branch naming convention, push under it: `git push -u <remote> HEAD:<branch-name>`. Otherwise push `worktree-<name>` as it is.
3. Open the PR with `gh pr create --head <branch-name>`; from a fork, `--repo <upstream> --head <fork-owner>:<branch-name>`. The body states what changed and why, and each gate with its result — only claims this run verified.

Done when `gh pr view --json url` prints the PR.

## 6. Review and fix

Run the `code-review` skill on the PR. Where it is unavailable, review the diff against the base branch yourself.

For each finding, check it against the code. Fix the confirmed ones, rerun the gates, and push; then bring the gate results in the PR body up to date with `gh pr edit --body`. Keep a finding you judge wrong, with the reason, for the report. Done when every finding is fixed or rejected with a reason.

## 7. Report and stop

Report the PR URL, the worktree path and branch, each gate with its result, and the findings fixed and rejected. Stay in the worktree: `/worktree-flow:worktree-merge` removes it after the merge.
