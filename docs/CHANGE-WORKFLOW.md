# Change Workflow


## Commit conventions

Use the `commit-commands:commit` skill (or `commit-commands:commit-push-pr`) for the standard flow. Local delta: one logical change per commit; imperative present tense ("Add X", "Fix Y", "Remove Z").

## Branching

- `master` is the main protected branch — no direct pushes from any actor.
- Branch off `master` with a descriptive name. Convention:
  - `fix/<id>-<slug>` — bug fixes
  - `feat/<id>-<slug>` — new features
  - `docs/<id>-<slug>` — documentation-only changes
  - `chore/<id>-<slug>` — housekeeping and refactoring
  `<id>` is the taskmgr short ID when one exists (e.g. `docs/claudedevt-2xdmn0-feature-branch-policy`).

## Pre-push checklist

These gates apply at PR-open time; re-run at merge time only if new commits were pushed since the last green run.

1. **Script tests** — `bash tests/run-all.sh` must pass.
2. **Structural validation** (plugin changes only) — Run `plugin-dev:plugin-validator` on every changed plugin; it ships in the external `plugin-dev` plugin, see [TESTING.md](TESTING.md) for install instructions. Then post the evidence on the taskmgr task this change closes, the same ID the PR body's `Closes` line will carry: `taskmgr comment add <task-id> "gate2:passed — <validator summary line>"`. When the change touches none of `.claude-plugin/plugin.json`, `agents/`, `skills/`, `commands/`, or `hooks/`, post `gate2:n/a` with a one-line reason instead. Missing evidence blocks the next release ([RELEASING.md](RELEASING.md)).
3. **Docs validation** (doc changes only) — `validate-routes.py` must exit 0; the Docs validation section in TESTING.md carries the commands.
4. **Lint** (any `*.sh` change) — `mise run lint` must pass; CI enforces it in the `shellcheck` job.

## Pull requests

Internal changes (maintainer or agent-orchestrated) use feature-branch PRs as the canonical workflow:

1. Branch off `master` using the naming convention above.
2. Push the branch to `origin`.
3. Open a PR — every applicable gate above must pass before opening. When a taskmgr task exists, the PR body must carry `Closes <task-id>`: `scripts/check-gate2-evidence.sh` parses that line to find the task holding the gate-2 evidence.
4. Merge after review, with all five CI jobs green — see [TESTING.md](TESTING.md) for the job list. Merges use GitHub's default merge-commit style, producing `Merge pull request #N from hk9890/<branch>` subjects (`hk9890/` is the GitHub owner namespace, not part of the branch name).

External contributors fork the repo and open a PR from their fork branch; no direct branch push to origin. The same pre-push checklist applies.

## Task tracking

Tasks are tracked with the `taskmgr` CLI via the `tasks` plugin. Typical workflow: `taskmgr ready` to find available work, `taskmgr create` to capture follow-ups discovered while working, `taskmgr close` when a task is done. See [the `tasks` skill](../plugins/tasks/skills/tasks/SKILL.md) for the full workflow.
