---
name: worktree-merge
description: "Merge a green PR, or take one already merged, then remove its worktree, update the default branch, and delete the merged branches."
user-invocable: true
disable-model-invocation: true
argument-hint: "[pr-number]"
---

**Merge the PR and clean up after it:** $ARGUMENTS

With no argument, `<pr>` is the pushed branch: the upstream of the current branch without the remote name (`git for-each-ref --format='%(upstream:short)' refs/heads/<current-branch>`, which still answers after the remote branch is deleted), because `gh` finds a PR by the local branch name and a push can use another one. With no upstream, or with the default branch as upstream, ask for the PR number. A PR the user already merged on GitHub is the common case: the same steps apply.

The run merges the PR as it is: it edits no file of the PR and pushes no commit. The one action that moves the head is the `gh pr update-branch` of the **Base** check, with its `git pull --ff-only`. A stop ends the run with a report of what stopped it. A repair is a new change that the user starts.

## 1. Check

`gh auth status` must succeed; where it fails, stop and tell the user to install `gh` or run `gh auth login`.

`gh pr view <pr> --json number,state,headRefName,headRefOid,baseRefName,mergeStateStatus`. Stop and report at the first failure:

- **Worktree** — `git status --porcelain` in the PR's worktree prints nothing, and `git rev-parse HEAD` equals `headRefOid`. Anything else is work the removal would destroy.
- **State** — `OPEN` or `MERGED`; `CLOSED` stops the run.
- **Target** — `baseRefName` equals the default branch of the remote, which `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` prints. A PR into another branch stops the run: its merge leaves the commits off the default branch.
- **Base**, for an `OPEN` PR — a `mergeStateStatus` of `DIRTY` is a conflict with the base branch: stop and report it. `UNKNOWN` means GitHub has not computed it yet: read it again; where it is still `UNKNOWN` a minute later, stop and report. `BEHIND` means the head lacks commits of the base branch, and the merge would fail: run `gh pr update-branch <pr>`, then `git pull --ff-only` in the PR's worktree, and read `headRefOid` again; it is another commit than before, and `git rev-parse HEAD` equals it.
- **CI**, for an `OPEN` PR — `gh pr checks <pr> --watch`; any failed check stops the run. `no checks reported` can mean the checks are not registered yet: run it again for up to a minute. Where it still prints that, the project has no checks: go on. Then apply **Base** to a new read of `mergeStateStatus`, because the first value is from before the checks and the base branch can move while they run; an update there needs **CI** again. `BLOCKED` at this point is a rule of the base branch that the PR does not meet, a missing approval for example: stop and report it.

## 2. Merge

For an `OPEN` PR: `gh pr merge <pr>` with the project's documented method. Where the project documents none, take the first of these that gives an answer:

1. **The one method the repository allows** — `gh api repos/{owner}/{repo} --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge}'` prints `true` for one method alone.
2. **The method of the last merged PRs** — `git fetch`, then `gh pr list --state merged --base <baseRefName> --limit 5 --json number,mergeCommit`, and `git show -s --format='%p | %s' <oid>` for each `mergeCommit`. Two parents is `--merge`; one parent with a subject that ends in `(#<number>)` is `--squash`; one parent otherwise is `--rebase`. The answer counts where all the PRs agree and the repository allows the method.
3. **`--merge`**, where the repository allows it; else ask the user which of the allowed methods to take.

Leave out `--delete-branch`: it also switches branches locally, which fails while another worktree holds the base branch. Where GitHub refuses the merge, a conflict with the base branch for example, stop and report its message. Done when `gh pr view <pr> --json state` prints `MERGED`.

## 3. Remove the worktree

Step 1 proved the worktree clean and pushed, and the PR is merged, so forcing loses no tracked and no untracked file. It does delete the gitignored ones, which `git status --porcelain` leaves out.

`git status --porcelain --ignored` in the worktree lists them, on the lines that start with `!!`. Pass over three kinds of entry: a symlink (`test -L`), which the harness added; one the project's setup or build makes again, a dependency, build or cache directory; and one that `diff -rq <entry> <same path in the main checkout>` finds equal, because the main checkout holds it already. The main checkout is the first line of `git worktree list`. Each entry left is **the user's file**: ask whether to copy it to the same path in the main checkout or to drop it. Where that path exists there already, the copy replaces each file that `diff -rq` reports as different: name those files in the question.

Copy with `cp -a` before the removal. Onto a directory that exists already, copy with `cp -a <entry>/. <same path>/`: the plain form puts the copy inside that directory.

`ExitWorktree` with `action: "remove"` and `discard_changes: true`. Without `discard_changes` it refuses even after a merge: it counts the branch commits as unmerged until the local default branch catches up, and a session inside a worktree cannot update that branch. It deletes the local branch too.

Where it answers that this session is not the owner (the worktree came from another session): `ExitWorktree` with `action: "keep"`, then `git worktree remove --force <worktree>` from the main checkout. `--force` gets past the symlinks the harness adds.

## 4. Update the default branch

Record `git rev-parse HEAD` in the main checkout, then `git fetch --prune` and `git pull --ff-only` on the default branch. Delete the PR's local branch where it still exists (`git branch -d`; `-D` after a squash or rebase merge). Where `git ls-remote --heads origin <head branch>` still finds the remote branch, delete it with `git push origin --delete <head branch>`.

The PR's dependencies were installed in the removed worktree only. The changed files are the PR's own, which an earlier pull can hold already (`gh api --paginate repos/{owner}/{repo}/pulls/<number>/files --jq '.[].filename'` with the `number` of step 1; `gh pr diff` refuses over 300 files), plus `git diff --name-only <recorded head> HEAD`. Where they hold a **dependency input**, a dependency manifest, lockfile or tool-version pin, find the project's setup (AGENTS.md or CLAUDE.md routing, a contributing or change-workflow doc, `CLAUDE.local.md`). Run nothing where the setup has no separate install part, or HEAD lacks the merge (a failed pull, another branch): `git merge-base --is-ancestor <oid> HEAD` fails, `<oid>` from `gh pr view <number> --json mergeCommit --jq .mergeCommit.oid`. Else run the install part alone in the main checkout, between two `git status --porcelain`: config, services or migrations are wrong to repeat there.

Done when the merged branches are deleted and one of these holds: the install ran, with its result and changed files kept for the report; no dependency input changed; nothing ran and the changed inputs are kept for the report.

## 5. Report

Report how the PR merged (by this run, with the method and what named it, or already), what was removed, each of the user's files with where its copy is or that it was dropped, and the install with its result and the files it changed, or the changed dependency inputs and the documented setup the user must run. Print `git worktree list` and `git branch -vv`, and name every other worktree or branch whose upstream is gone. List them, and remove them only when the user says so.

Done when the report holds each of these items, or says that it does not apply.
