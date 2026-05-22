# Change Workflow


## Commit conventions

- One logical change per commit.
- Message: imperative, present tense ("Add X", "Fix Y", "Remove Z").

## Branching

- `master` is the main branch.
- we push directly to master; no feature branches

## Pre-push checklist

Run these gates before pushing to master:

1. **Script tests** — `bash tests/run-all.sh` must pass.
2. **Structural validation** (plugin changes only) — Run `plugin-dev:plugin-validator` on every changed plugin. This agent ships in the external `plugin-dev` plugin; see [TESTING.md](TESTING.md) for install instructions.
3. **Docs validation** (doc changes only) — If you touched canonical docs under `docs/`, run:
   ```bash
   bash plugins/project-docs/skills/project-docs/scripts/verify.sh .
   ```
   Hard failures (broken routes, malformed CLAUDE.md) must be fixed before pushing. Soft warnings are informational.

See [RELEASING.md](RELEASING.md) for the release process — it runs gates 1 and 2 above against every plugin, plus version-bump steps. Gate 3 (docs validation) is pre-push only.

## Pull requests

This repo does not use feature-branch PRs internally — maintainers push directly to `master`. External contributors should fork the repo and open a pull request from their fork; the same pre-push checklist applies to the forked branch before the PR is opened.

## Task tracking

Tasks are tracked with the `beads` CLI (`bd`) via the `beads-tasks` plugin. Typical workflow: `bd ready` to find available work, `bd create` to capture follow-ups discovered while working, `bd close` when a task is done. See [plugins/beads-tasks/README.md](../plugins/beads-tasks/README.md) for the full workflow.
