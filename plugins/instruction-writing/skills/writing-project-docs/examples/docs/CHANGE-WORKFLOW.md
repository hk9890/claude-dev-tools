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

## CI — required checks

The check list and how to run it locally are in [TESTING.md](TESTING.md); CI adds the Docker image
build. All of them must be green before merge is allowed — a red check blocks the merge button, it
is not a warning to argue past.
