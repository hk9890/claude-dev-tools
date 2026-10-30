---
name: worktree-review
description: "Review a PR and push the fixes: the project's rules review, then the code review."
when_to_use: "Triggers on 'review the PR and push the fixes'. Also loaded by name at the review step of a change workflow. Not for a review without a push, with or without `--fix` (`code-review`), nor for the rules review alone (`project-review:project-review-change`)."
argument-hint: "[pr-number]"
---

**Review this PR and push what the reviews fix:** $ARGUMENTS

**The project's own review rules win over this skill.**

**Another forge** — the steps use `gh`, for GitHub. Where the PR's remote is on another forge, run each `gh` step with the forge CLI that the project documents, and stop and report each field of step 1 that it cannot read. Pass both reviews the PR's head branch in place of `<pr-number>`: they read a number as a GitHub PR.

With no argument, the PR is the one of the current branch's upstream, without the remote name (`git rev-parse --abbrev-ref @{upstream}`): `gh` finds a PR by the local branch name, and a push can use another one. With no upstream, or the default branch as upstream, ask for the PR number. The run ends at a reviewed PR: the user starts `/worktree-flow:worktree-merge`.

## 1. Check the PR

Stop and report at the first failure:

- `gh auth status` succeeds.
- The PR is `OPEN`, and `isCrossRepository` is `false`: the fixes go to its head branch.
- `git rev-parse HEAD` equals its `headRefOid`, and `git status --porcelain` prints nothing: both reviews edit this tree. Where the head differs, name the way in: a worktree that holds the PR's branch (`gh pr checkout <pr-number>`).

**Reviewed already** — where `headRefOid` starts with the commit after `through` in the **Review** line of the body, go to step 5. One case runs again: where that line records the rules review as skipped and `project-review:project-review-change` is in your available skills, go on with step 2, then run the **Rules** review of step 3, and the **Code** review only where the rules review applied a fix.

Done when the checks hold and the run is known: the full review, the rules review alone, or the report alone.

## 2. Gates

Run each gate that the project needs green for a PR, after its setup where this checkout lacks it, unless this session has a result of it for this head. A gate is **clear** when it is green, when it cannot run here and is reported as skipped, or when it is red on the base branch too and the user said in this session to go on.

Done when each gate is clear; else stop and report it.

## 3. Review and fix

- **Rules.** Where `project-review:project-review-change` is in your available skills, call the Skill tool with `project-review:project-review-change` and the argument `--fix <pr-number>`, even where it loaded earlier in this session, and follow it to its last step. Its reviewer agent starts from that skill only; where it runs in the background, wait for its notification and go on from the step that started it. Its relay puts the open items to the user as questions: go on without an answer, and keep the open questions, the fixes it did not apply, its `/tasks:tasks-create` suggestion and its suggested rule additions for steps 4 and 5. Where the skill is not in your available skills, report the rules review as skipped, never as passed, with the reason: the `project-review` plugin is not installed, or its skill at that version is for the user alone.
- **Code.** After the push of the rules fix, because the code review reads the PR's pushed head, call the Skill tool with `code-review` and the argument `<effort> --fix <pr-number>`, even where it loaded earlier in this session, and wait for its notification. Take `<effort>` from the PR's paths after the rules fix: `medium` where the PR changes only text for people to read, such as release notes; else `xhigh`, also for instructions an agent reads and for text a program decides on, such as a version bump.

After each review that applied a fix, before the next review: run each gate again, repeat each drive (a run of the built product by hand) that this session ran or that the **Driven** lines of the body name, and fix what broke. Then commit in the project's style and `git push <remote> HEAD:<headRefName>`, where `<remote>` is the upstream's remote, else the one that holds the PR's repository. Where the remote rejects the push, the head moved during the review: stop, report it, and keep the commit local.

Done when the rules review finished or is reported as skipped, the code review finished or does not run under step 1, `git status --porcelain` prints nothing, and `gh pr view <pr-number> --json headRefOid` prints `git rev-parse HEAD`.

## 4. Record the review

Read the body again with `gh pr view <pr-number> --json body`, then edit it with `gh pr edit <pr-number> --body-file`, from a file outside the checkout. Put the **Review** line in the list under `## Evidence`, else as the last line, in place of an older one; where the code review did not run again, keep its part of the older line. Bring each **Gate** and **Driven** line that this run ran again up to date.

```markdown
- **Review:** `project-review-change --fix`: <fixes applied, fixes not applied and open questions, or no written rules, or skipped and why>; suggested rule additions: <each as `<document>`: <the rule in one sentence>, or none>; `code-review <effort> --fix`: <findings applied, and findings not applied>, through `<head commit>`
```

`<head commit>` is the full `git rev-parse HEAD` after the last push: a later run reads it to tell whether the head was reviewed. Keep `;` and the word `through` out of each placeholder's text: they split the line.

Done when, in `gh pr view <pr-number> --json headRefOid,body`, the commit after `through` in the **Review** line is `headRefOid`.

## 5. Report

Report the PR URL, each review with its outcome, the open questions and the fixes not applied of the rules review with its `/tasks:tasks-create` suggestion, its suggested rule additions with their documents, and each gate with its result. Where `worktree-ship` invoked this run, keep these items for its report in place of this one.

Done when the report, or the items kept for `worktree-ship`, hold each item, or say that it does not apply.
