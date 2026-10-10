---
name: worktree-ship
description: "Ship a change from a worktree to an open, reviewed PR, then stop for /worktree-flow:worktree-merge."
user-invocable: true
disable-model-invocation: true
argument-hint: "[change-to-make]"
---

**Ship this change as a reviewed PR:** $ARGUMENTS

With no argument, ship the change the checkout holds: the current worktree's, or the **stray work** on the main checkout (step 2). Where it holds none and step 2 finds no stopped run, ask what to change. The run ends at an open PR; merging belongs to `/worktree-flow:worktree-merge`, which the user starts.

A run **resumes**: it can start in the main checkout with nothing done, in a worktree with the change half made, or on a PR already reviewed. Each step states the result it leaves, and a step whose result already stands is skipped. A gate or drive result stands only for the tree it ran on.

## 1. Read the project's change rules

`gh auth status` must succeed; where it fails, stop and tell the user to install `gh` or run `gh auth login`.

Read the project's own workflow (AGENTS.md or CLAUDE.md routing, a change-workflow or contributing doc, `CLAUDE.local.md`, a PR template) and record: the remote to push to and its base branch, the branch naming convention, the **gates** a PR needs green plus the setup a fresh checkout needs, how the product is run by hand (a running doc such as `docs/RUNNING.md`), the commit style, and the PR template where there is one. Where the project documents a step, its rule replaces the generic one below.

Done when each item of that list is recorded, or noted as not documented.

## 2. Enter a worktree

Where `git rev-parse --path-format=absolute --git-dir --git-common-dir` prints two different paths, the session is in a worktree already. Look up its PR with `gh pr view <pushed-branch> --json number,state,headRefOid,mergeable,body`:

- **No PR, or an `OPEN` one** — stay in the worktree. Where `git branch --list 'worktree-ship-stray/<worktree-name>'` prints a branch, with the last path segment of `git rev-parse --show-toplevel` as the name, a stopped run left **stray work** for this worktree: read [the stray-work move](references/stray-work.md) and do its **Bring in**. Then run the setup from step 1 where it has not run.
- **A `MERGED` or `CLOSED` one** — stop and report: the worktree belongs to a finished change, and a new change needs a new worktree.

Otherwise the session is in the main checkout:

1. `git fetch`, and choose the worktree's name: bare kebab-case, for example `fix-login`, and not the last path segment of a worktree that `git worktree list` prints.
2. Run three checks: `git status --porcelain -- ':/' ':(top,exclude).claude/worktrees'`, `git rev-list @{upstream}..HEAD` where the branch has an upstream, and `git branch --list 'worktree-ship-stray/*'`. Where one of them prints a line, the main checkout holds **stray work**, or the branch a stopped move left: read [the stray-work move](references/stray-work.md) and do its **Ask first** and **Move out** now, because the work must leave the main checkout before item 4.
3. Where the harness setting `worktree.baseRef` is `head` (`.claude/settings.local.json` or `.claude/settings.json`), the worktree branches from local HEAD: fast-forward the default branch, or the change starts from a stale base.
4. Call `EnterWorktree` with the name, or with the `path` of the worktree where a continued move has one already — before starting any subagent: a subagent already running when the session enters a worktree loses its Bash. Where item 2 moved stray work out or continued a move, do the **Bring in** of the stray-work move.
5. Run the setup from step 1.

Done when the session is in a worktree, the setup has run, and `git branch --list 'worktree-ship-stray/<worktree-name>'` prints nothing.

**Pushed already** — `git status --porcelain` prints nothing, the PR is `OPEN` with a `headRefOid` equal to `git rev-parse HEAD`, and, where the run has an argument, the PR's diff carries that whole change. Go to step 7, where the review tells whether this head is reviewed and runs what is missing. Where `mergeable` is `CONFLICTING`, report that the PR needs the base branch merged in before it can merge.

`<pushed-branch>` is the branch's upstream without the remote name (`git rev-parse --abbrev-ref @{upstream}`): `gh` finds a PR by the local branch name, and step 6 can push under another one. With no upstream, or with the base branch as upstream, nothing was pushed: there is no `<pushed-branch>` and no PR.

## 3. Implement

Read what the worktree holds: `git status`, and `git diff --merge-base <remote>/<base-branch>`, which leaves out what landed on the base branch since the worktree left it. Make the part of the change that is missing, and add or update the tests that cover it.

Done when the diff carries the whole change and its tests.

## 4. Run the gates

Run every gate. Fix and rerun until all are green. A gate that also fails on the base branch was broken before this change: report it and ask the user. Keep each gate's command and result for the PR body; a gate that cannot run here is reported as skipped, never as passed.

## 5. Drive the change by hand

Run the built product the way step 1 recorded, with the `run` skill where the project documents nothing, and use the change the way its user reaches it. A gate proves the tests; this step proves the feature.

Fix what the drive shows broken, then return to step 4. Keep each command and what it showed for the PR body. A part that cannot be driven here, for example one that needs an interactive terminal, is reported as not driven, with what the user must check by hand.

Done when each part of the change is driven and shows nothing broken, or is reported as not driven with what the user must check by hand.

## 6. Commit, push, open the PR

Commit in the project's style. Push with upstream tracking: to `<pushed-branch>` where there is one, else under the project's branch convention where it has one (`git push -u <remote> HEAD:<branch-name>`). Read [the PR body template](references/pr-body.md) and write the body in its shape to a file outside the worktree. Open the PR with `gh pr create --body-file`; where step 2 found an `OPEN` PR, bring its body up to date with `gh pr edit <pr-number> --body-file`.

Done when `git status --porcelain` prints nothing, and `gh pr view <pushed-branch> --json state,headRefOid`, with `<pushed-branch>` read again after the push, prints `OPEN` and the commit of `git rev-parse HEAD`.

## 7. Review and fix

Invoke `worktree-flow:worktree-review` with the argument `<pr-number>`.

Where it pushed a fix, read the body again with `gh pr view <pr-number> --json body` and bring it up to date with `gh pr edit <pr-number> --body-file`: the gate and drive results, and every other part the fixes made stale. The **Review** line stays as the review wrote it.

Done when the review has finished, and the body carries the gate and drive results of the PR's head.

## 8. Report and stop

Report the PR URL, the worktree path, each gate and each drive with its result, the review findings applied, the open questions of the rules review and the fixes it did not apply, every step this run skipped, the stray work left on the main checkout, and the next step: the user starts `/worktree-flow:worktree-merge`, which merges the PR and removes the worktree. Stay in the worktree.

Done when the report holds each of these items, or says that it does not apply.
