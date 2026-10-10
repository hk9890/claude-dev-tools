---
name: worktree-review
description: "Review a PR and push the fixes: the project's rules review, then the code review, with the result recorded in the PR body."
when_to_use: "Use when the user asks for a PR to be reviewed and the fixes pushed. Triggers on 'review and fix the PR'. Also loaded by name at the review step of a project's change workflow or of `worktree-ship`. Not for a plain 'review this PR' or a code review alone, with or without `--fix` (`code-review`), nor for the rules review alone (`project-review:project-review-change`)."
argument-hint: "[pr-number]"
---

**Review this PR and push what the reviews fix:** $ARGUMENTS

With no argument, review the PR that this branch was pushed to. The run ends at a reviewed PR: the merge belongs to `/worktree-flow:worktree-merge`, which the user starts.

## 1. Check the PR

`gh auth status` must succeed; where it fails, stop and tell the user to install `gh` or run `gh auth login`.

`gh pr view <pr> --json number,url,state,headRefName,headRefOid,body`. With no argument, `<pr>` is the pushed branch: the upstream of the current branch without the remote name (`git rev-parse --abbrev-ref @{upstream}`), because `gh` finds a PR by the local branch name and a push can go under another one. Stop and report at the first failure:

- **PR** — the lookup finds one. With no upstream, or with the base branch as upstream, nothing was pushed: ask for the PR number.
- **State** — `OPEN`.
- **Head** — `git rev-parse HEAD` equals `headRefOid`: both reviews edit the tree, and a checkout that differs from the PR gives a review of something else. Where they differ, say which side is behind.
- **Tree** — `git status --porcelain` prints nothing: other edits would mix with the fixes.

**Reviewed already** — the commit after `through` in the **Review** line of the body is `headRefOid`. Go to step 5: the report is the whole run. One case runs again: where that line records the rules review as skipped and `project-review:project-review-change` is in your available skills, go on with step 2 and run item 1 of step 3. Run item 2 only where item 1 applied a fix; else step 4 keeps the `code-review` part of the old line.

Done when the four checks hold, and you know whether the head is reviewed already.

## 2. Read how the project proves a change

Read the project's own workflow (AGENTS.md or CLAUDE.md routing, a change-workflow or contributing doc, `CLAUDE.local.md`) and record the **gates** a PR needs green and the commit style. Where this session recorded them already, as inside `/worktree-flow:worktree-ship`, use that record.

Run each gate that this session has no result of for the PR's head. Where one is red, stop and report it: a review reads a change that works. Report a gate that cannot run here as skipped.

Done when the gates and the commit style are recorded, or noted as not documented, and each gate is green on the PR's head or reported as skipped.

## 3. Review and fix

Two reviews run on the PR, one after the other:

1. **Rules.** Invoke `project-review:project-review-change` with the argument `--fix <pr-number>`, where that skill is in your available skills. Keep its open questions unanswered for step 5, with the fixes it did not apply, and go on. In a project with no written rules it says so and reviews nothing: report that as its result. Where the skill is not in your available skills, report the rules review as skipped, never as passed, and give the reason, as far as you can tell which: the `project-review` plugin is not installed, or is installed at a version whose skill only the user can start.
2. **Code.** Invoke the `code-review` skill with the argument `xhigh --fix <pr-number>`. It runs in the background: wait for its completion notification, then read which findings it applied.

After each of the two that applied a fix, before you go on, so that the second review reads the head the first one fixed:

1. Run every gate. Fix what the fix broke and rerun until all are green.
2. Repeat each drive that this session ran: a drive is a run of the built product by hand that shows the change working. A gate or a drive result stands only for the tree it ran on.
3. Commit in the project's style, and push the commit to the PR's head branch: `git push <remote> HEAD:<headRefName>`.

Done when the rules review has finished or was skipped under item 1, the code review has finished, each gate is green on the final tree or reported as skipped, each drive of this session is repeated on it, `git status --porcelain` prints nothing, and `gh pr view <pr-number> --json headRefOid` prints the commit of `git rev-parse HEAD`.

## 4. Record the review

Read the body again with `gh pr view <pr-number> --json body`, and put the **Review** line into it with `gh pr edit <pr-number> --body-file`, from a file outside the checkout: in the list under `## Evidence` where the body has that heading, else as the last line. It takes the place of an older **Review** line.

```markdown
- **Review:** `project-review-change --fix`: <fixes applied, fixes not applied and open questions, or no written rules, or skipped and why>; `code-review xhigh --fix`: <findings applied>, through `<head commit>`
```

`<head commit>` is the full commit that `git rev-parse HEAD` prints after the last push: a later run reads it to tell whether the head was reviewed.

Done when `gh pr view <pr-number> --json headRefOid,body` prints a body in which the commit after `through` in the **Review** line is `headRefOid`.

## 5. Report

Report the PR URL, each review with its outcome, the open questions of the rules review and the fixes it did not apply, each gate with its result, and each **Gate** or **Driven** line of the body that stands for an older tree. Where `worktree-ship` invoked this run, carry these items to its report in place of a report of this skill.

Done when the report holds each of these items, or says that it does not apply.
