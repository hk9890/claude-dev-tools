# Change Workflow

## Commits

Use the `commit-commands:commit` skill for the standard flow.

**Local delta:** one logical change per commit, imperative present tense (`Add widget soft-delete`,
`Fix pagination off-by-one`), and no `WIP` commits on a branch targeting `main`.

## Branches

- Branch from `main`.
- Prefix: `feat/`, `fix/`, `chore/`, `docs/`.
- Example: `feat/bulk-delete-widgets`

## Pull requests

1. Open PR against `main`.
2. Fill in the PR template (summary + test plan).
3. One approval required before merge.
4. Squash-merge; delete branch after merge.

## Worktrees

Work on a branch in a worktree whenever the main checkout holds changes you are not part of — it
keeps that work untouched instead of carrying it onto your branch.

**Create one with Claude Code's worktree tool, not `git worktree add`.** The tool places the tree
under `.claude/worktrees/<name>`, branches it from `main`, and moves the session into it; a
hand-made worktree lands outside that layout and the session keeps running in the old directory, so
edits go to the wrong tree.

A fresh worktree has no `.env` and no running database — copy `.env` across and run `make dev-db` in
it before `make test-integration`, or the suite fails on a connection error that looks like a code
bug. `dev-db` binds `5432`, so stop the container in the other tree first.

Once the branch is merged, remove the worktree and delete the branch — a stale worktree keeps its
branch alive and `git worktree list` stops being a picture of what is in flight.

## CI — required checks

The check list and how to run it locally are in [TESTING.md](TESTING.md); CI adds the Docker image
build. All of them must be green before merge is allowed — a red check blocks the merge button, it
is not a warning to argue past.
