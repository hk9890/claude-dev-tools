---
name: worktree-merge
description: "Merge a green PR, or take one already merged, then remove its worktree, update the default branch, and delete the merged branches."
user-invocable: true
disable-model-invocation: true
argument-hint: "[pr-number]"
---

**Merge the PR and clean up after it:** $ARGUMENTS

**The project's own rules for a merge win over this skill.**

With no argument, the PR is the one of the current branch's upstream, without the remote name: `git for-each-ref --format='%(upstream:short)' refs/heads/<branch>`, which still answers after the remote branch is deleted. `gh` finds a PR by the local branch name, and a push can use another one. With no upstream, or the default branch as upstream, ask for the PR number.

## 1. Check

Stop and report at the first failure:

- `gh auth status` succeeds.
- The PR's worktree is clean and at the PR's `headRefOid`: its removal must lose no work.
- The PR is `OPEN` or `MERGED`, and its base is the remote's default branch.
- For an `OPEN` PR, `mergeStateStatus` is not `DIRTY`, and not `UNKNOWN` a minute later. On `BEHIND`, run `gh pr update-branch <pr>`, then `git pull --ff-only` in the worktree.
- For an `OPEN` PR, `gh pr checks <pr> --watch` shows no failed check. Where it prints `no checks reported` for a minute, the project has none. Then read `mergeStateStatus` again, because the base can move while the checks run. Apply the check above to it, and after an update watch the checks again. Stop on `BLOCKED`, a branch rule the PR does not meet.

Done when each check holds.

## 2. Merge

For an `OPEN` PR: `gh pr merge <pr>` with the project's method. Where it names none, take the one method the repository allows, else the method of its last merged PRs where they agree (two parents: `--merge`; one parent with a subject that ends in `(#<number>)`: `--squash`; else `--rebase`), else `--merge` where the repository allows it, else ask. Leave out `--delete-branch`: it switches branches locally, which fails while another worktree holds the base branch.

Done when `gh pr view <pr> --json state` prints `MERGED`.

## 3. Remove the worktree

The removal deletes the gitignored files: `git status --porcelain --ignored` lists them on the `!!` lines. Pass over a symlink the harness added, a file that the setup or build makes again, and a file equal to the one in the main checkout (`diff -rq`). For each other file, ask the user to copy it to the main checkout or to drop it, and name each file there that the copy replaces (`diff -rq`). Onto a directory that exists, copy with `cp -a <entry>/. <path>/`: the plain form puts the copy inside it.

Then `ExitWorktree` with `action: "remove"` and `discard_changes: true`: without that flag it refuses after a merge, because the local default branch has not caught up. Where it answers that this session is not the owner, use `ExitWorktree` with `action: "keep"`, then `git worktree remove --force <worktree>` from the main checkout.

Done when the worktree is gone, and each of the user's files is copied or dropped.

## 4. Update the default branch

In the main checkout: record `git rev-parse HEAD`, then `git fetch --prune` and `git pull --ff-only`. `ExitWorktree` with `remove` can have deleted the PR's local branch with the worktree: delete it where `git branch --list <branch>` still prints it (`-D` after a squash or rebase merge). Delete its remote branch where it still exists. The dependencies were installed in the removed worktree only: where the PR's files or `git diff --name-only <recorded> HEAD` hold a dependency manifest, lockfile or tool-version pin, run the project's install step, and nothing else of its setup, in the main checkout.

Done when the merged branches are deleted and the install ran or is not needed.

## 5. Report

Report how the PR merged (by this run with its method, or already), what was removed, where each of the user's files went, and the install with its result, or the install that the user must run. Print `git worktree list` and `git branch -vv`, and name each worktree or branch whose upstream is gone. Remove them only when the user says so.

Done when the report holds each item, or says that it does not apply.
