# Stray work

**Stray work** is what the main checkout holds when a run starts there: uncommitted files, and commits the upstream of its branch lacks. It moves into the worktree, and the main checkout is left clean.

A session inside a worktree cannot run git on another checkout. So the work leaves the main checkout before `EnterWorktree`, on a branch this run owns: `worktree-ship-stray/<worktree-name>`. That branch is also the mark a stopped run leaves.

The **dirty check** is the `git status` command of step 2. Its pathspec leaves out the worktrees the harness keeps under `.claude/worktrees`.

## Ask first

Stop and ask the user, with nothing moved yet, in three cases:

- **The run has an argument.** Show `git status --short`, and `git log --oneline @{upstream}..HEAD` where the branch has an upstream, and ask whether that work belongs to the change. Where it does not, leave it where it is, go on with step 2 of the skill, and name the work left on the main checkout in the report of step 8.
- **The main checkout is on another branch than `<base-branch>`**, and that branch is not a `worktree-ship-stray/*` one. Ask which change to ship. The work stays on that branch, as under the first case: **Move out** is for `<base-branch>` alone.
- **A `worktree-ship-stray/*` branch exists.** A stopped run left it. Show the branch and its `git log --oneline <base-branch>..<branch>`, and ask whether this run continues that move.
  - Where it does not, stop the run and leave the branch to the user: it can hold the only copy of that work.
  - Where `<base-branch>` holds uncommitted files as well, they are newer than that move: ask what happens to them, and continue only once the dirty check prints nothing.
  - A continued move takes the worktree's name from the last segment of the branch, and **Move out** goes on where it stopped: at item 2 where the checkout is on that branch, at item 4 where it is on `<base-branch>`.

With no argument, on `<base-branch>`, and with no such branch, the stray work is the change: move it without a question.

Done when each case that applies has the user's answer, and the run takes one of three exits: **Move out** starts with a fixed worktree name, the work stays and the run goes on with step 2 of the skill, or the run stops.

## Move out

In the main checkout:

1. `git switch -c worktree-ship-stray/<worktree-name>`.
2. Where the dirty check prints a line, `git add -A -- ':/' ':(top,exclude).claude/worktrees'`, then `git -c commit.gpgsign=false commit --no-verify -m "worktree-ship: uncommitted stray work"`. That commit is **transport**: **Bring in** takes it apart again.
3. `git switch <base-branch>`.
4. Where the branch has an upstream and `git rev-list @{upstream}..HEAD` prints commits: once the dirty check prints nothing and `git merge-base --is-ancestor HEAD worktree-ship-stray/<worktree-name>` succeeds, `git reset --hard @{upstream}`.

Where git refuses a command, or the check of item 4 fails, stop and ask the user: the reset destroys what the branch does not hold.

Done when the dirty check prints nothing, and `git rev-list @{upstream}..HEAD` prints nothing where the branch has an upstream.

## Bring in

In the worktree, whose name is the last path segment of `git rev-parse --show-toplevel`:

1. `git merge --ff-only worktree-ship-stray/<worktree-name>`. Where git refuses it in a worktree this run created, `git reset --hard worktree-ship-stray/<worktree-name>`: that worktree holds nothing yet, and the change then starts from the base the stray work had. Where git refuses it in a worktree a stopped run left, stop and ask the user.
2. Where `git log -1 --format=%s` prints the subject of the transport commit, run `git reset HEAD~1 && git branch -D worktree-ship-stray/<worktree-name>` as one command: the files are uncommitted again, and no run can stop between the two. Otherwise `git branch -D worktree-ship-stray/<worktree-name>`.

Done when `git branch --list worktree-ship-stray/<worktree-name>` prints nothing, and `git log -1 --format=%s` prints another subject than the transport commit's.
