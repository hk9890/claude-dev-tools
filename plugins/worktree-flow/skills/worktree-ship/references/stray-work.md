# Stray work

**Stray work** is what the main checkout holds when a run starts there: uncommitted files, and commits the upstream of its branch lacks. It moves into the worktree, and the main checkout is left clean.

A session inside a worktree cannot run git on another checkout. So the work leaves the main checkout before `EnterWorktree`, on a branch this run owns: `worktree-ship-stray/<worktree-name>`. That branch is also the mark a stopped run leaves.

## Ask first

Stop and ask the user, with nothing moved yet, in three cases:

- **The run has an argument.** Show `git status --short` and `git log --oneline @{upstream}..HEAD`, and ask whether that work belongs to the change. Where it does not, leave it where it is, go on with step 2 of the skill, and name the work left on the main checkout in the report of step 8.
- **The main checkout is on another branch than `<base-branch>`.** Ask which change to ship.
- **A `worktree-ship-stray/*` branch exists.** A stopped run left it. Show the branch and its `git log --oneline @{upstream}..<branch>`, and ask whether this run continues that move; where the main checkout holds new stray work as well, say so in the question. Where the run continues it, the worktree's name is the last segment of the branch, and **Move out** goes on where it stopped: at item 2 where the checkout is on that branch, at item 4 where it is on `<base-branch>`.

With no argument, on `<base-branch>`, and with no such branch, the stray work is the change: move it without a question.

## Move out

In the main checkout:

1. `git switch -c worktree-ship-stray/<worktree-name>`. The uncommitted files come along.
2. Where `git status --porcelain -- ':/' ':(top,exclude).claude/worktrees'` prints a line, `git add -A -- ':/' ':(top,exclude).claude/worktrees'`, then `git -c commit.gpgsign=false commit --no-verify -m "worktree-ship: uncommitted stray work"`. That commit is transport: **Bring in** takes it apart again.
3. `git switch <base-branch>`.
4. Where `git rev-list @{upstream}..HEAD` prints commits and `git merge-base --is-ancestor HEAD worktree-ship-stray/<worktree-name>` succeeds, `git reset --hard @{upstream}`.

Where git refuses a command, stop and ask the user: the reset destroys what the branch does not hold.

Done when that `git status` command and `git rev-list @{upstream}..HEAD` both print nothing. Then go on with step 2 of the skill, which enters the worktree. A worktree a stopped run left under the name is entered with its `path`.

## Bring in

In the worktree, whose name is the last path segment of `git rev-parse --show-toplevel`:

1. `git merge --ff-only worktree-ship-stray/<worktree-name>`. Where git refuses it in a worktree this run created, `git reset --hard worktree-ship-stray/<worktree-name>`: that worktree holds nothing yet, and the change then starts from the base the stray work had. Where git refuses it in a worktree a stopped run left, stop and ask the user.
2. Where `git log -1 --format=%s` prints `worktree-ship: uncommitted stray work`, run `git reset HEAD~1 && git branch -D worktree-ship-stray/<worktree-name>` as one command: the files are uncommitted again, and no run can stop between the two. Otherwise `git branch -D worktree-ship-stray/<worktree-name>`.

Done when `git branch --list worktree-ship-stray/<worktree-name>` prints nothing, and `git log -1 --format=%s` prints another subject than the transport commit's.
