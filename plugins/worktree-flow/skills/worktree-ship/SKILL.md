---
name: worktree-ship
description: "Ship a change from a worktree to an open, reviewed PR, then stop for /worktree-flow:worktree-merge."
user-invocable: true
disable-model-invocation: true
argument-hint: "[change-to-make]"
---

**Ship this change as a reviewed PR:** $ARGUMENTS

With no argument, ship the change the checkout holds. A run can resume: skip each step whose result already stands for the current tree. The project's own change rules win over this skill.

## 1. Read the project's change rules

Record from the project's workflow docs (AGENTS.md or CLAUDE.md routing, a change-workflow or contributing doc, a PR template): the remote and its `<base-branch>` (else the remote's default branch), the branch naming, the setup a fresh checkout needs, the **gates** a PR needs green, how to run the product by hand, and the commit style.

## 2. Enter a worktree

Where `git rev-parse --git-dir` and `git rev-parse --git-common-dir` print different paths, the session is in a worktree: stay. Look its PR up with `gh pr view <upstream-branch>`, the upstream without the remote name: `gh` finds a PR by the local branch name, and the push can use another one. With no upstream there is no PR yet. Where the PR is `MERGED` or `CLOSED`, stop: a new change needs a new worktree.

From the main checkout, choose a kebab-case `<worktree-name>`. Where the **dirty check** `git status --porcelain -- ':/' ':(top,exclude).claude/worktrees'` prints a line, or `git rev-list @{upstream}..HEAD` does where the branch has an upstream, or a `worktree-ship-stray/*` branch exists, read [the stray-work move](references/stray-work.md) and do its **Ask first** and **Move out**: work that belongs to the change leaves the main checkout before `EnterWorktree`. Call `EnterWorktree` with the name before you start any subagent: a subagent that runs while the session enters a worktree loses its Bash.

In the worktree, where this run moved stray work out or continued a move, or where `git branch --list 'worktree-ship-stray/<worktree-name>'` prints a branch, with the last path segment of `git rev-parse --show-toplevel` as the name, do the **Bring in** of [the stray-work move](references/stray-work.md). Then run the setup.

Done when the session is in a worktree, the setup has run there, and that `git branch --list` prints nothing.

## 3. Implement

Where the change implements tracker issues, mark each one in progress before the first edit; for taskmgr, where `tasks:tasks-core` is in your available skills, call the Skill tool with it, even where it loaded earlier in this session; else report the issue as not marked. Make the change and its tests.

## 4. Prove it

Run every gate until it is green. Then run the product by hand the way the project documents, else call the Skill tool with `run`, even where it loaded earlier in this session, and use the change the way its user reaches it. Keep each command and its result for the PR body. A gate or drive that cannot run here is reported as skipped with the reason, never as passed; a gate that fails on the base branch too goes to the user.

Done when each gate and drive is green or reported as skipped.

## 5. Open the PR

Commit in the project's style, and push with upstream tracking under the project's branch naming. Write the body in the shape of [the PR body template](references/pr-body.md) and open the PR against the base branch, or update the body of the PR step 2 looked up.

## 6. Review

Call the Skill tool with `worktree-flow:worktree-review` and the PR number, even where it loaded earlier in this session. Where it pushed fixes, update the parts of the body they made stale.

## 7. Report and stop

Report the PR URL, the worktree path, each gate and drive with its result, the review result (the items `worktree-review` kept for this report, or why it stopped), each step skipped, and any stray work left on the main checkout. Next step: the user starts `/worktree-flow:worktree-merge`. Stay in the worktree.
