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

Use one whenever the main checkout holds work you are not part of.

- Create it with Claude Code's worktree tool, never `git worktree add`.
- Run `scripts/setup-worktree.sh` before any `make` target — a fresh tree has no `.env` and no database.
- Remove the worktree and delete the branch once it is merged.

## CI — required checks

- Run the checks locally first — [TESTING.md](TESTING.md) has the list; CI adds the Docker image build.
- Fix a red check before asking for review; a red check blocks the merge button.
