---
name: worktree-merge
description: "Merge a green PR, or take one already merged, then remove its worktree, update the default branch, and delete the merged branches."
user-invocable: true
disable-model-invocation: true
argument-hint: "[pr-number-or-url]"
---

**Merge the PR and clean up after it:** $ARGUMENTS

With no argument, take the PR of the current branch (`gh pr view`); where there is none, ask which PR. A PR the user already merged on GitHub is the common case: the same steps apply.

A session inside a worktree may run git only against that worktree — the harness refuses `git -C <main checkout>`. So the steps leave the worktree before they touch the default branch. Inside the worktree, run git plainly; from the main checkout, reach the worktree with `git -C <worktree>`.

## 1. Locate everything

`gh auth status` must succeed; where it fails, stop and tell the user to install `gh` or run `gh auth login`. Then record, each from a command's output:

- **PR** — `gh pr view <pr> --json number,url,state,mergeable,headRefName,headRefOid,baseRefName`.
- **Local branch** — the branch whose upstream is the PR head (`git for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads`), else the branch named like the head. A branch pushed under another name than its local one matches only by upstream.
- **Worktree** — the `git worktree list --porcelain` entry holding the local branch, or none.
- **Session position** — one of: in this PR's worktree; in another worktree; in the main checkout; started inside this PR's worktree, with no other directory to return to.
- **Remotes** — the one holding the base branch and the one holding the head branch; the same remote unless the PR comes from a fork.

Done when every item has a value or is marked absent.

## 2. Check that the work is safe to merge and remove

Stop and report at the first failure:

- **Position** — the session was not started inside the worktree. If it was, tell the user to run this skill from the main checkout.
- **Worktree** — skip when there is none. `git status --porcelain` prints nothing, and `git rev-parse HEAD` equals `headRefOid`. Anything else is work the removal would destroy.
- **State** — `OPEN` or `MERGED`. `CLOSED` stops the run.

For an `OPEN` PR also:

- **Conflicts** — `mergeable` is not `CONFLICTING`.
- **CI** — `gh pr checks <pr> --watch` waits for running checks. Any failed check stops the run; "no checks reported" is a repo without CI, and passes.

## 3. Merge

Skip this step for a `MERGED` PR.

Take the merge method from the project's docs. Where they name none, take the first one `gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed` allows, in the order merge commit, squash, rebase. Run `gh pr merge <pr> --merge|--squash|--rebase` without `--delete-branch`: that flag also switches branches locally, which fails while another worktree holds the base branch. A refusal (review required, branch protection, out of date) stops the run with gh's message.

Done when `gh pr view <pr> --json state` prints `MERGED`.

## 4. Remove the worktree

Skip when there is none. Step 2 proved the worktree clean and equal to the merged head, and step 3 proved the PR merged, so the forcing below loses nothing:

- **In this PR's worktree** — `ExitWorktree` with `action: "remove"` and `discard_changes: true`. Without `discard_changes` the tool refuses: it counts the branch commits as unmerged until the local base branch catches up, which step 5 can do only outside the worktree. It deletes the local branch too. Where it answers that this session is not the owner (the worktree came from another session), continue as for another worktree.
- **In another worktree** — `ExitWorktree` with `action: "keep"`, to get back to the main checkout. Then as below.
- **In the main checkout** — `git worktree remove --force <worktree>`. `--force` is needed for the symlinked and ignored files the harness adds.

Done when `git worktree list` no longer shows it and the session's directory is the main checkout.

## 5. Update the default branch

`git fetch --prune <base remote>`, then bring the local base branch to the merged tip:

- Checked out here and clean: `git merge --ff-only <base remote>/<base branch>`.
- Not checked out anywhere: `git fetch <base remote> <base branch>:<base branch>`.
- Checked out in another worktree, local changes, or not fast-forwardable: leave it, and report it.

Done when the local base branch equals `<base remote>/<base branch>`, or the mismatch is reported.

## 6. Delete the branches

- **Local** — where step 4 left it, `git branch -d <local branch>`. After a squash or rebase merge `-d` refuses; use `-D`.
- **Remote** — GitHub often deletes the head branch on merge. Where `git ls-remote --exit-code --heads <head remote> <head branch>` still finds it, run `git push <head remote> --delete <head branch>`.

Done when `git branch --list <local branch>` and `git ls-remote --heads <head remote> <head branch>` both print nothing.

## 7. Report

Report the PR and how it merged (by this run, or already), the new tip of the base branch, and each worktree and branch removed. Print `git worktree list` and `git branch -vv`, and name every other worktree or branch whose PR is merged or whose upstream is gone. Those belong to other work: list them, and remove them only when the user says so.
