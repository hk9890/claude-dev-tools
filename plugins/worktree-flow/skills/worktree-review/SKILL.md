---
name: worktree-review
description: "Review a PR and push the fixes: the project's rules review, then the code review."
when_to_use: "Triggers on 'review the PR and push the fixes'. Also loaded by name at the review step of a change workflow. Not for a review without a push (`code-review`), nor for the rules review alone (`project-review:project-review-change`)."
argument-hint: "[pr-number]"
---

**Review this PR and push what the reviews fix:** $ARGUMENTS

**The project's own review rules win over this skill.**

**Another forge** — where the PR's remote is not on GitHub, follow [another-forge.md](references/another-forge.md) from step 1 on.

With no argument, the PR is the one of the current branch's upstream without the remote name (`git rev-parse --abbrev-ref @{upstream}`), which can differ from the local name. With no upstream, or the default branch as upstream, ask for the PR number. The run ends at a reviewed PR: the user starts `/worktree-flow:worktree-merge`.

## 1. Check the PR

Stop and report at the first failure:

- `gh auth status` succeeds.
- The PR is `OPEN`, and `isCrossRepository` is `false`: the fixes go to its head branch.
- `git rev-parse HEAD` equals its `headRefOid`, and `git status --porcelain` prints nothing: both reviews edit this tree. Where the head differs, name the way in: a worktree on the PR's branch (`gh pr checkout <pr-number>`).
- `mergeStateStatus` is not `DIRTY`, and not `UNKNOWN` a minute later; else the base must come in first, by the project's method.

**Reviewed already** — where `headRefOid` starts with the commit after `through` in the **Review** line of the body, go to step 5; where that line records the rules review as skipped and its skill is now in your available skills, run step 2, the **Rules** review, and the **Code** review only where it applied a fix.

Done when the checks hold and the run is known: the full review, the rules review alone, or the report alone.

## 2. Gates

Run each gate that the project needs green for a PR, after its setup where this checkout lacks it, unless this session has a result of it for this head. A gate is **clear** when it is green, skipped with the reason because it cannot run here, or red on the base branch too with the user's go-on in this session.

Done when each gate is clear; else stop and report it.

## 3. Review and fix

- **Rules.** Where `project-review:project-review-change` is in your available skills, call the Skill tool with it and the argument `--fix <pr-number>`, even where it loaded earlier in this session, and follow it to its last step. Its reviewer agent starts from that skill only; where it runs in the background, wait for its notification and go on from the step that started it. At its steps 4 and 5, keep its open questions, unapplied fixes, `/tasks:tasks-create` suggestion, suggested rule additions and any `html-visualize-ask` command for steps 4 and 5 here, unasked, which ends its step 4; never apply or answer one yourself. Else report the rules review as skipped, never as passed, with the reason: the `project-review` plugin is missing or its skill user-only.
- **Code.** After the push of the rules fix, call the Skill tool with `code-review` and the argument `<effort> <pr-number>`, even where it loaded earlier in this session, and wait for its notification. `<effort>` is `medium` where the PR, after the rules fix, changes only text for people to read, such as release notes; else `xhigh`, as for a skill or a version bump. Apply each finding that needs no user decision. Add each other finding's change to the options of the rules-review question it answers, else make it an open question with options and a recommendation, its reason and cost.

After each review that changed the tree, before the next review: run each gate again, repeat each drive that this session ran or that the **Driven** lines of the body name, and fix what broke. Then commit in the project's style and `git push <remote> HEAD:<headRefName>` to the upstream's remote, else the PR repository's. A rejected push means the head moved during the review: stop, report it, and keep the commit local.

Done when the rules review finished or is reported as skipped, the code review finished or does not run under step 1, each code-review finding is applied or kept as an open question, `git status --porcelain` prints nothing, and `gh pr view <pr-number> --json headRefOid` prints `git rev-parse HEAD`.

## 4. Record the review

Edit the body as `gh pr view <pr-number> --json body` prints it now, with `gh pr edit <pr-number> --body-file` from a file outside the checkout. Put the **Review** line in the list under `## Evidence`, else as the last line, in place of an older one; where the code review did not run again, keep its part of the older line. Bring each **Gate** and **Driven** line that this run ran again up to date.

```markdown
- **Review:** `project-review-change --fix`: <fixes applied, fixes not applied and open questions, or no written rules, or skipped and why>; suggested rule additions: <each as `<document>`: <the rule in one sentence>, or none>; `code-review <effort>`: <findings applied, and findings kept as open questions>, through `<head commit>`
```

`<head commit>` is the full `git rev-parse HEAD` after the last push. Keep `;` and `through` out of each placeholder: they split the line.

Done when, in `gh pr view <pr-number> --json headRefOid,body`, the commit after `through` in the **Review** line is `headRefOid`.

## 5. Report

Report the PR URL, each review with its outcome, each gate with its result, and the items step 3 kept; for a review step 3 did not run, the **Review** line's open questions. Put the open questions last, as one numbered list the user answers in one reply. Where `worktree-ship` invoked this run, keep these items, in that form, for its report instead.

Done when the report, or the items kept for `worktree-ship`, hold each item or say it does not apply.
