---
name: worktree-merge
description: "Merge a green PR, or take one already merged, then remove its worktree, update the default branch, delete the merged branches, and close the issues it resolved."
user-invocable: true
disable-model-invocation: true
argument-hint: "[pr-number]"
---

**Merge the PR and clean up after it:** $ARGUMENTS

**The project's own rules for a merge win over this skill.**

**Another forge** — run each `gh` step with the forge CLI the project documents; with none documented, at the first field of step 1 that CLI cannot read, or at a later `gh` step it cannot run, stop and ask the user.

With no argument, the PR is the one of the current branch's upstream, without the remote name: `git for-each-ref --format='%(upstream:short)' refs/heads/<branch>`, which still answers after the remote branch is deleted. `gh` finds a PR by the local branch name, and a push can use another one. With no upstream, or the default branch as upstream, ask for the PR number.

## 1. Check

Stop and report at the first failure:

- `gh auth status` succeeds.
- The PR's worktree is clean and at the PR's `headRefOid`: its removal must lose no work.
- The PR is `OPEN` or `MERGED`, and its base is the remote's default branch.
- For an `OPEN` PR, `mergeStateStatus` is not `DIRTY`, and not `UNKNOWN` a minute later. On `BEHIND`, run `gh pr update-branch <pr>`, then `git pull --ff-only` in the worktree.
- For an `OPEN` PR, `gh pr checks <pr> --watch` shows no failed check. Where it prints `no checks reported` for a minute, the project has none. Then read `mergeStateStatus` again, because the base can move while the checks run. Apply the check above to it, and after an update watch the checks again. Stop on `BLOCKED`, a branch rule the PR does not meet.
- For an `OPEN` PR whose body has a **Review** line, the review covers `headRefOid`. With `<through>` the commit after `through` in that line, in the worktree after `git fetch <remote> <base>`: `git merge-base --is-ancestor <through> <headRefOid>` exits 0, and each commit that `git log --format=%H <through>..<headRefOid> ^<remote>/<base>` prints is a merge whose `git show --remerge-diff --format= <commit>` prints nothing. Any other commit, or a non-zero exit, went in after the review: report it, and name `worktree-flow:worktree-review <pr>` as the way to review it.

Done when each check holds.

## 2. Merge

For an `OPEN` PR: `gh pr merge <pr> --match-head-commit <headRefOid>` with the project's method, `<headRefOid>` as step 1 last read it. Where it names none, take the one method the repository allows, else the method of its last merged PRs where they agree (two parents: `--merge`; one parent with a subject that ends in `(#<number>)`: `--squash`; else `--rebase`), else `--merge` where the repository allows it, else ask. Leave out `--delete-branch`: it switches branches locally, which fails while another worktree holds the base branch.

Done when `gh pr view <pr> --json state` prints `MERGED`.

## 3. Remove the worktree

The removal deletes the gitignored files: `git status --porcelain --ignored` lists them on the `!!` lines. Pass over a symlink the harness added, a file that the setup or build makes again, and a file equal to the one in the main checkout (`diff -rq`). For each other file, ask the user to copy it to the main checkout or to drop it, and name each file there that the copy replaces (`diff -rq`). Onto a directory that exists, copy with `cp -a <entry>/. <path>/`: the plain form puts the copy inside it.

Then `ExitWorktree` with `action: "remove"` and `discard_changes: true`: without that flag it refuses after a merge, because the local default branch has not caught up. Where it answers that this session is not the owner, use `ExitWorktree` with `action: "keep"`, then `git worktree remove --force <worktree>` from the main checkout.

Done when the worktree is gone, and each of the user's files is copied or dropped.

## 4. Update the default branch

Below, `<default>` is the PR's base branch and `<remote>` its remote. Another session can have switched the main checkout or left changes in it. In the main checkout, run this as one call, so the shell picks the branch:

```bash
git fetch --prune <remote> &&
if [ "$(git branch --show-current)" = "<default>" ] && [ -z "$(git status --porcelain)" ]; then
  echo "pull from $(git rev-parse HEAD)" && git pull --ff-only <remote> <default>
else
  echo "leave that checkout as it is" && git fetch . <remote>/<default>:<default>
fi
```

`ExitWorktree` with `remove` can have deleted the PR's local branch with the worktree: delete it where `git branch --list <branch>` still prints it, with the name the worktree's branch had, which can differ from the PR's head branch (`-D` after a squash or rebase merge). Delete its remote branch where it still exists. The dependencies were installed in the removed worktree only: where the pull ran and the PR's files or `git diff --name-only <recorded> HEAD` hold a dependency manifest, lockfile or tool-version pin, run the project's install step, and nothing else of its setup, in the main checkout. `<recorded>` is the commit the `pull from` line printed.

Done when `<default>` is at `<remote>/<default>` or git refused, the merged branches are deleted, and the install ran, is not needed, or is left to the user.

## 5. Close the resolved issues

The issues are those the PR resolves, as its body or this conversation names them. Where an available skill covers their tracker, call the Skill tool with it, even where it loaded earlier in this session; else use the tracker's own CLI where it is installed. Where neither reaches the tracker, leave each issue open with that reason.

For each issue still open, check its criteria, else what its body asks for, against what merged: the files at `<remote>/<default>`, and the PR's evidence for a criterion that needs a run. Close each issue whose criteria all hold, without asking, citing the PR's URL.

Done when each issue is closed, or open with the reason.

## 6. Report

Report how the PR merged (by this run with its method, or already), what was removed, where each of the user's files went, whether `<default>` is current, else git's refusal, the install with its result, or the install that the user must run, and each issue by its id and title: closed, or open with the reason. Print `git worktree list` and `git branch -vv`, and name each worktree or branch whose upstream is gone. Remove them only when the user says so.

Done when the report holds each item, or says that it does not apply.
