# Change Workflow


## Commit conventions

- One logical change per commit.
- Message: imperative, present tense ("Add X", "Fix Y", "Remove Z").

## Branching

- `master` is the main protected branch — no direct pushes from any actor.
- Internal changes (maintainer or agent-orchestrated) branch off `master` with a descriptive name. Recommended convention:
  - `fix/<id>-<slug>` — bug fixes
  - `feat/<id>-<slug>` — new features
  - `docs/<id>-<slug>` — documentation-only changes
  - `chore/<id>-<slug>` — housekeeping and refactoring
  `<id>` is the beads short ID when one exists (e.g. `docs/d2m-feature-branch-policy`).
- External contributors fork the repo and PR from their fork; no direct branch push to origin.

Note: earlier merges in history carry a `hk9890/` user-namespace prefix (e.g. `hk9890/fix/wq6-...`). Branches created going forward follow the bare `fix/<id>-<slug>` form without a user prefix.

## Pre-push checklist

These gates apply at PR-open time; re-run at merge time only if new commits were pushed since the last green run.

1. **Script tests** — `bash tests/run-all.sh` must pass.
2. **Structural validation** (plugin changes only) — Run `plugin-dev:plugin-validator` on every changed plugin. This agent ships in the external `plugin-dev` plugin; see [TESTING.md](TESTING.md) for install instructions.
3. **Docs validation** (doc changes only) — If you touched canonical docs under `docs/`, run:
   ```bash
   bash plugins/project-docs/skills/project-docs/scripts/verify.sh .
   ```
   Hard failures (broken routes, malformed CLAUDE.md) must be fixed before pushing. Soft warnings are informational.

See [RELEASING.md](RELEASING.md) for the release process — it runs gates 1 and 2 above against every plugin, plus version-bump steps.

## Pull requests

Internal changes (maintainer or agent-orchestrated) use feature-branch PRs as the canonical workflow:

1. Branch off `master` using the naming convention above.
2. Push the branch to `origin`.
3. Open a PR — all three pre-push gates must be green before opening.
4. Merge after review. Merges use GitHub's default merge-commit style (produces `Merge pull request #N from ...` commits).

External contributors fork the repo, branch off their fork's `master`, and open a PR from their fork branch. The same pre-push checklist applies before opening the PR.

## Task tracking

Tasks are tracked with the `beads` CLI (`bd`) via the `beads-tasks` plugin. Typical workflow: `bd ready` to find available work, `bd create` to capture follow-ups discovered while working, `bd close` when a task is done. See [plugins/beads-tasks/README.md](../plugins/beads-tasks/README.md) for the full workflow.
