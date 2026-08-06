# Change Workflow

How a change lands here: commit conventions, branch naming, the pre-push gates, and the PR flow.

## Commits and branches

Use the `commit-commands:commit` skill (or `commit-commands:commit-push-pr`) for the standard flow. **Local delta:** one logical change per commit; imperative present tense ("Add X", "Fix Y", "Remove Z").

`master` is the protected main branch — no direct pushes from any actor. Branch off it with a prefixed slug that says what the branch does (`docs/feature-branch-policy`): `fix/`, `feat/`, `docs/`, `chore/`. Prefixing an issue or task ID is allowed but never required — nothing here parses it.

## Pre-push checklist

These gates apply at PR-open time; re-run at merge time only if new commits landed since the last green run. Each is named for what it checks, and the same names are used in [RELEASING.md](RELEASING.md).

- **Test-Run** (always) — `bash tests/run-all.sh` must pass. Mirrored by the CI `test` job.
- **Plugin-Structure-Check** (plugin changes only) — run `plugin-dev:plugin-validator` on every changed plugin; zero errors required. Skip it when the change touches none of `.claude-plugin/plugin.json`, `agents/`, `skills/`, `commands/`, or `hooks/`. Put its summary line in the PR body: the validator is an agent, so no CI job can enforce it and nothing audits it afterwards. It ships in the external `plugin-dev` plugin ([TESTING.md](TESTING.md)).
- **Docs-Route-Check** (doc changes only) — `validate-routes.py` must exit 0; the Docs validation section in TESTING.md carries the commands.
- **Shell-Lint** (any `*.sh` change) — `mise run lint` must pass. Mirrored by the CI `shellcheck` job.

## Pull requests

Internal changes (maintainer or agent-orchestrated) use feature-branch PRs as the canonical workflow:

1. Branch off `master` per the convention above and push it to `origin`.
2. Open a PR — every applicable gate must pass before opening.
3. Merge after review, with all five CI jobs green ([TESTING.md](TESTING.md)). Merges use GitHub's default merge-commit style, producing `Merge pull request #N from hk9890/<branch>` subjects — `hk9890/` is the owner namespace, not part of the branch name.

External contributors fork the repo and open a PR from their fork branch; no direct branch push to origin. The same checklist applies.
