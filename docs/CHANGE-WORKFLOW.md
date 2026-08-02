# Change Workflow


## Commit conventions

Use the `commit-commands:commit` skill (or `commit-commands:commit-push-pr`) for the standard flow. Local delta: one logical change per commit; imperative present tense ("Add X", "Fix Y", "Remove Z").

## Branching

- `master` is the main protected branch — no direct pushes from any actor.
- Branch off `master` with a descriptive name. Convention:
  - `fix/<slug>` — bug fixes
  - `feat/<slug>` — new features
  - `docs/<slug>` — documentation-only changes
  - `chore/<slug>` — housekeeping and refactoring
  The slug says what the branch does (`docs/feature-branch-policy`). Prefixing an issue or task ID is allowed but never required — nothing in this repo parses it.

## Pre-push checklist

These gates apply at PR-open time; re-run at merge time only if new commits were pushed since the last green run. Each is named for what it checks — the same names are used in [RELEASING.md](RELEASING.md), so a gate means the same thing wherever it is cited.

- **Test-Run** (always) — `bash tests/run-all.sh` must pass. Mirrored by the CI `test` job.
- **Plugin-Structure-Check** (plugin changes only) — Run `plugin-dev:plugin-validator` on every changed plugin; it must pass with zero errors. It ships in the external `plugin-dev` plugin, see [TESTING.md](TESTING.md) for install instructions. Skip it when the change touches none of `.claude-plugin/plugin.json`, `agents/`, `skills/`, `commands/`, or `hooks/`. Put the validator's summary line in the PR body so a reviewer can see it ran. No CI job can enforce this one — the validator is an agent, not a script — and nothing audits it afterwards; RELEASING.md re-runs it over every plugin before a release, which is where a plugin that was never validated is caught.
- **Docs-Route-Check** (doc changes only) — `validate-routes.py` must exit 0; the Docs validation section in TESTING.md carries the commands.
- **Shell-Lint** (any `*.sh` change) — `mise run lint` must pass. Mirrored by the CI `shellcheck` job.

## Pull requests

Internal changes (maintainer or agent-orchestrated) use feature-branch PRs as the canonical workflow:

1. Branch off `master` using the naming convention above.
2. Push the branch to `origin`.
3. Open a PR — every applicable gate above must pass before opening.
4. Merge after review, with all five CI jobs green — see [TESTING.md](TESTING.md) for the job list. Merges use GitHub's default merge-commit style, producing `Merge pull request #N from hk9890/<branch>` subjects (`hk9890/` is the GitHub owner namespace, not part of the branch name).

External contributors fork the repo and open a PR from their fork branch; no direct branch push to origin. The same pre-push checklist applies.
