# Stray work

**Stray work** is what the main checkout holds when a run starts there: uncommitted files, and commits its upstream lacks. A session inside a worktree cannot run git on another checkout, so the work leaves the main checkout before `EnterWorktree`, on a branch this run owns: `worktree-ship-stray/<worktree-name>`. That branch is also the mark a stopped run leaves. The **dirty check** is the `git status` command of the skill's step 2.

## Ask first

Stop and ask the user, with nothing moved yet, where:

- **The run has an argument.** Show the dirty check and, where the branch has an upstream, `git log --oneline @{upstream}..HEAD`, and ask whether that work belongs to the change. Where it does not, leave it, go on with step 2, and name it in the report.
- **The main checkout is on a branch other than `<base-branch>`** and not on a `worktree-ship-stray/*` one. Ask which change to ship, and leave the work on that branch.
- **A `worktree-ship-stray/*` branch exists.** Show it with `git log --oneline <branch> --not --remotes`, and ask whether this run continues that move. Where it does not, stop: the branch can hold the only copy of the work. Where `<base-branch>` also holds uncommitted files, ask what happens to them first. A continued move takes the worktree's name from the branch, and **Move out** goes on at item 2 on that branch, at item 4 on `<base-branch>`.

With no argument, on `<base-branch>`, and with no such branch, the stray work is the change: move it without a question.

## Move out

In the main checkout:

1. `git switch -c worktree-ship-stray/<worktree-name>`.
2. Where the dirty check prints a line, `git add -A -- ':/' ':(top,exclude,glob)[.]claude/worktrees' ':(top,exclude,glob)[.]claude/worktrees/**'`, then `git -c core.hooksPath=/dev/null -c commit.gpgsign=false commit -m "worktree-ship: uncommitted stray work"`. This **transport** commit is found again by its subject, which no hook may change. The `[.]` keeps `git add` from refusing the excludes where `.claude/` is gitignored.
3. `git switch <base-branch>`.
4. Where the branch has an upstream and `git rev-list @{upstream}..HEAD` prints commits: once the dirty check prints nothing and `git merge-base --is-ancestor HEAD worktree-ship-stray/<worktree-name>` succeeds, `git reset --hard @{upstream}`.

Where git refuses a command or the check of item 4 fails, stop and ask the user: the reset destroys what the branch does not hold.

## Bring in

In the worktree, named by the last path segment of `git rev-parse --show-toplevel`. Where `EnterWorktree` gave it another name than the move's, first `git branch -m worktree-ship-stray/<old-name> worktree-ship-stray/<worktree-name>`.

1. `git merge --ff-only worktree-ship-stray/<worktree-name>`. Where git refuses it in a worktree this run created, `git reset --hard worktree-ship-stray/<worktree-name>`: that worktree holds nothing yet. In a worktree a stopped run left, stop and ask the user.
2. Once `git merge-base --is-ancestor worktree-ship-stray/<worktree-name> HEAD` succeeds: where `git log -1 --format=%s` prints the transport subject, run `git reset HEAD~1 && git branch -D worktree-ship-stray/<worktree-name>` as one command, so no run stops between the two; else `git branch -D worktree-ship-stray/<worktree-name>`. Where the check fails, stop and ask the user.

Done when `git branch --list 'worktree-ship-stray/<worktree-name>'` prints nothing.
