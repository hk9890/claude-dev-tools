---
name: worktree-review
description: "Review a PR and push the fixes: the project's rules review, then the code review, with the result recorded in the PR body."
when_to_use: "Use when the user asks for a PR to be reviewed and the fixes pushed. Triggers on 'review the PR and push the fixes'. Also loaded by name at the review step of a project's change workflow or of `worktree-ship`. Not for a plain 'review this PR' or a code review alone, with or without `--fix` (`code-review`), nor for the rules review alone (`project-review:project-review-change`)."
argument-hint: "[pr-number]"
---

**Review this PR and push what the reviews fix:** $ARGUMENTS

With no argument, review the PR that this branch was pushed to. The run ends at a reviewed PR: the merge belongs to `/worktree-flow:worktree-merge`, which the user starts. A gate or a drive result stands only for the tree it ran on.

## 1. Check the PR

`gh auth status` must succeed; where it fails, stop and tell the user to install `gh` or run `gh auth login`.

`gh pr view <pr> --json number,url,state,isCrossRepository,headRefName,headRefOid,body`; the `number` it prints is `<pr-number>`. With no argument, `<pr>` is the pushed branch: the upstream of the current branch without the remote name (`git rev-parse --abbrev-ref @{upstream}`), because `gh` finds a PR by the local branch name and a push can go under another one. Stop and report at the first failure:

- **PR** — the lookup finds one. With no upstream, or with the default branch of the remote as upstream, nothing was pushed: ask for the PR number.
- **State** — `OPEN`.
- **Repository** — `isCrossRepository` is `false`: the fixes go to the PR's head branch, and this run pushes to no fork.
- **Head** — `git rev-parse HEAD` equals `headRefOid`: both reviews edit the tree, and a checkout that differs from the PR gives a review of something else. Where they differ, name the way in: a worktree that holds the PR's branch, in step with the remote (`gh pr checkout <pr-number>` in it).
- **Tree** — `git status --porcelain` prints nothing: other edits would mix with the fixes.

**Reviewed already** — `headRefOid` starts with the commit after `through` in the **Review** line of the body. Go to step 5: the report is the whole run. One case runs again: where that line records the rules review as skipped and `project-review:project-review-change` is in your available skills, go on with step 2 and run the **Rules** review of step 3. Run the **Code** review only where the rules review applied a fix; else its part of the old line stands, and step 4 keeps it.

Done when the five checks hold, and the run is one of three: the full review, the rules review alone, or the report alone.

## 2. Read how the project proves a change

Read the project's own workflow (AGENTS.md or CLAUDE.md routing, a change-workflow or contributing doc, `CLAUDE.local.md`) and record the **gates** a PR needs green, the setup a fresh checkout needs, and the commit style. Where this session recorded them already, as inside `/worktree-flow:worktree-ship`, use that record. Run the setup where it has not run in this checkout.

Run each gate that this session has no result of for the PR's head. A gate is **clear** when it is green, when it cannot run here and is reported as skipped, or when it is red on the base branch too and the user said in this session to go on. Where a gate is not clear, stop and report it: a review reads a change that works.

Done when the three items are recorded, or noted as not documented, and each gate is clear on the PR's head.

## 3. Review and fix

Two reviews run on the PR, the rules review first:

- **Rules.** Invoke `project-review:project-review-change` with the argument `--fix <pr-number>`, where that skill is in your available skills. Keep its open questions unanswered for step 5, with the fixes it did not apply, and go on. In a project with no written rules it says so and reviews nothing: report that as its result. Where the skill is not in your available skills, report the rules review as skipped, never as passed, and give the reason, as far as you can tell which: the `project-review` plugin is not installed, or is installed at a version whose skill only the user can start.
- **Code.** Invoke the `code-review` skill with the argument `xhigh --fix <pr-number>`. It runs in the background: wait for its completion notification, then read which findings it applied.

After each review that applied a fix, do these three in order before you go on, so that the code review reads the head the rules review fixed:

1. Run every gate. Fix what the fix broke and rerun until all are clear.
2. Repeat each drive of the change: a drive is a run of the built product by hand that shows the change working, and the ones to repeat are those this session ran and those the **Driven** lines of the PR body name. Fix what a drive shows broken, then return to item 1.
3. Commit in the project's style, and push the commit to the PR's head branch: `git push <remote> HEAD:<headRefName>`, with the remote of the branch's upstream, or the one that holds the PR's repository where the branch has none. Where the remote rejects the push, the PR's head moved during the review: stop and report it, and leave the commit local.

Done when the rules review has finished or was skipped, the code review has finished or stands under step 1, each gate is clear on the final tree, each drive is repeated on it, `git status --porcelain` prints nothing, and `gh pr view <pr-number> --json headRefOid` prints the commit of `git rev-parse HEAD`.

## 4. Record the review

Read the body again with `gh pr view <pr-number> --json body`, and edit it with `gh pr edit <pr-number> --body-file`, from a file outside the checkout:

- Put the **Review** line in the list under `## Evidence` where the body has that heading, else as the last line. It takes the place of an older **Review** line.
- Bring each **Gate** and **Driven** line whose command this run ran again up to date.

```markdown
- **Review:** `project-review-change --fix`: <fixes applied, fixes not applied and open questions, or no written rules, or skipped and why>; `code-review xhigh --fix`: <findings applied>, through `<head commit>`
```

`<head commit>` is the full commit that `git rev-parse HEAD` prints after the last push: a later run reads it to tell whether the head was reviewed.

Done when `gh pr view <pr-number> --json headRefOid,body` prints a body in which the commit after `through` in the **Review** line is `headRefOid`.

## 5. Report

Report the PR URL, each review with its outcome, the open questions of the rules review and the fixes it did not apply, and each gate with its result. Where `worktree-ship` invoked this run, carry these items to its report in place of a report of this skill.

Done when the report holds each of these items, or says that it does not apply. Where `worktree-ship` invoked this run, done when each item is kept for its step 8.
