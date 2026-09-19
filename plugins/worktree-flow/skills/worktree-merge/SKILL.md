---
name: worktree-merge
description: "Merge a green PR, or take one already merged, then remove its worktree, update the default branch, and delete the merged branches."
user-invocable: true
disable-model-invocation: true
argument-hint: "[pr-number]"
---

**Merge the PR and clean up after it:** $ARGUMENTS

With no argument, take the PR of the current branch. A PR the user already merged on GitHub is the common case: the same steps apply.

## 1. Check

`gh pr view <pr> --json number,state,headRefOid`. Stop and report at the first failure:

- **Worktree** — `git status --porcelain` in the PR's worktree prints nothing, and `git rev-parse HEAD` equals `headRefOid`. Anything else is work the removal would destroy.
- **State** — `OPEN` or `MERGED`; `CLOSED` stops the run.
- **CI**, for an `OPEN` PR — `gh pr checks <pr> --watch`; any failed check stops the run.

## 2. Merge

For an `OPEN` PR: `gh pr merge <pr>` with the project's documented method, else `--merge`. Leave out `--delete-branch`: it also switches branches locally, which fails while another worktree holds the base branch. Done when `gh pr view <pr> --json state` prints `MERGED`.

## 3. Remove the worktree

Step 1 proved the worktree clean and pushed, and the PR is merged, so forcing loses nothing.

`ExitWorktree` with `action: "remove"` and `discard_changes: true`. Without `discard_changes` it refuses even after a merge: it counts the branch commits as unmerged until the local default branch catches up, and a session inside a worktree cannot update that branch. It deletes the local branch too.

Where it answers that this session is not the owner (the worktree came from another session): `ExitWorktree` with `action: "keep"`, then `git worktree remove --force <worktree>` from the main checkout. `--force` gets past the symlinks the harness adds.

## 4. Update the default branch

`git fetch --prune`, then `git pull --ff-only` on the default branch. Delete the PR's local branch where it still exists (`git branch -d`; `-D` after a squash merge). Where `git ls-remote --heads origin <head branch>` still finds the remote branch, delete it with `git push origin --delete <head branch>`.

## 5. Report

Report how the PR merged (by this run, or already) and what was removed. Print `git worktree list` and `git branch -vv`, and name every other worktree or branch whose upstream is gone. List them, and remove them only when the user says so.
