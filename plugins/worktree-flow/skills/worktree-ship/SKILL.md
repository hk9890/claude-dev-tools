---
name: worktree-ship
description: "Ship a change from a worktree to an open, reviewed PR, then stop for /worktree-flow:worktree-merge."
user-invocable: true
disable-model-invocation: true
argument-hint: "[change-to-make]"
---

**Ship this change as a reviewed PR:** $ARGUMENTS

With no argument, ship the change the current worktree holds; where it holds none, ask what to change. The run ends at an open PR; merging belongs to `/worktree-flow:worktree-merge`, which the user starts.

A run **resumes**: it can start in the main checkout with nothing done, in a worktree with the change half made, or on a PR already reviewed. Each step states the result it leaves, and a step whose result already stands is skipped.

## 1. Read the project's change rules

`gh auth status` must succeed; where it fails, stop and tell the user to install `gh` or run `gh auth login`.

Read the project's own workflow (AGENTS.md or CLAUDE.md routing, a change-workflow or contributing doc, `CLAUDE.local.md`, a PR template) and record: the remote to push to, the branch naming convention, the **gates** a PR needs green plus the setup a fresh checkout needs, how the product is run by hand (a running doc such as `docs/RUNNING.md`), the commit style, and the PR template where there is one. Where the project documents a step, its rule replaces the generic one below.

## 2. Enter a worktree

Where `git rev-parse --git-dir` and `git rev-parse --git-common-dir` print different paths, the session is in a worktree already: stay in it, and run the setup from step 1 where it has not run.

Otherwise:

1. `git fetch`. Where the harness setting `worktree.baseRef` is `head` (`.claude/settings.local.json` or `.claude/settings.json`), the worktree branches from local HEAD: fast-forward the default branch first, or the change starts from a stale base.
2. Call `EnterWorktree` with a bare kebab-case name, for example `fix-login` — before starting any subagent: a subagent already running when the session enters a worktree loses its Bash.
3. Run the setup from step 1.

**Shipped already** — `git status --porcelain` prints nothing, `gh pr view --json state,headRefOid,body` shows an `OPEN` PR whose `headRefOid` equals `git rev-parse HEAD`, and the **Review** line of its body names that commit. Then go to step 8 and change nothing.

## 3. Implement

Read what the worktree holds: `git status`, and `git diff` against the base branch. Make the part of the change that is missing, and add or update the tests that cover it.

Done when the diff carries the whole change and its tests.

## 4. Run the gates

Run every gate. Fix and rerun until all are green. A gate that also fails on the base branch was broken before this change: report it and ask the user. Keep each gate's command and result for the PR body; a gate that cannot run here is reported as skipped, never as passed.

## 5. Drive the change by hand

Run the built product the way step 1 recorded, with the `run` skill where the project documents nothing, and use the change the way its user reaches it. A gate proves the tests; this step proves the feature.

Fix what the drive shows broken, then return to step 4. Keep each command and what it showed for the PR body. A part that cannot be driven here, for example one that needs an interactive terminal, is reported as not driven, with what the user must check by hand.

## 6. Commit, push, open the PR

Commit in the project's style. Push with upstream tracking, under the project's branch convention where it has one (`git push -u <remote> HEAD:<branch-name>`). Read [the PR body template](references/pr-body.md) and write the body in its shape to a file outside the worktree. Open the PR with `gh pr create --body-file`; where the branch has a PR, bring its body up to date with `gh pr edit --body-file`.

## 7. Review and fix

Invoke the `code-review` skill with the argument `xhigh --fix <pr-number>`. It runs in the background: wait for its completion notification, then read which findings it applied. Repeat steps 4 and 5, commit, push, and bring the PR body up to date with `gh pr edit --body-file`: the gate and drive results, the **Review** line with the commit just pushed, and every other part the fixes made stale.

Done when the review has finished, its fixes are pushed with every gate green, and the **Review** line names the PR's head commit.

## 8. Report and stop

Report the PR URL, the worktree path, each gate and each drive with its result, the review findings applied, and every step this run skipped. Stay in the worktree: `/worktree-flow:worktree-merge` removes it.
