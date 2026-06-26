# Change Workflow

## Commits

- One logical change per commit.
- Message format: imperative present tense — `Add widget soft-delete`, `Fix pagination off-by-one`.
- No `WIP` commits on branches targeting `main`.

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

- `make test`
- `make lint`
- Docker image build

All checks must be green before merge is allowed.
