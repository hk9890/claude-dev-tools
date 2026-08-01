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
  `<id>` is the taskmgr short ID when one exists (e.g. `docs/claudedevt-2xdmn0-feature-branch-policy`).
- External contributors fork the repo and PR from their fork; no direct branch push to origin.

Merge subjects read `Merge pull request #N from hk9890/<branch>` — `hk9890/` is the GitHub owner namespace, not part of the branch name.

## Pre-push checklist

These gates apply at PR-open time; re-run at merge time only if new commits were pushed since the last green run.

1. **Script tests** — `bash tests/run-all.sh` must pass.
2. **Structural validation** (plugin changes only) — Run `plugin-dev:plugin-validator` on every changed plugin. This agent ships in the external `plugin-dev` plugin; see [TESTING.md](TESTING.md) for install instructions. After it passes, record the evidence with `taskmgr comment add <task-id> "gate2:passed — <validator summary line>"` on the task the PR body's `Closes` line names. If the change does not touch validator-checked surface (`.claude-plugin/plugin.json`, `agents/`, `skills/`, `commands/`, or `hooks/`), post a `gate2:n/a` comment with a one-line reason instead. This comment is the audit-trail evidence that gate 2 ran. **Important:** this is a process-enforcement gate, not a hard PR-merge block. The gate is enforced at release time (see [RELEASING.md](RELEASING.md)) by `scripts/check-gate2-evidence.sh`, which fails loudly if any PR merged since the previous release is missing its gate2 comment. A PR that skips this step will block the next release.
3. **Docs validation** (doc changes only) — If you touched canonical docs under `docs/`, run:
   ```bash
   SCR=plugins/project-review/skills/project-review-docs/scripts
   python3 "$SCR/validate-routes.py" . --include-docs   # hard-fails on broken routes
   python3 "$SCR/manifest.py" . --format=text           # CLAUDE.md invariant, missing/hollow docs, dead links
   ```
   A non-zero `validate-routes.py` (broken routes) must be fixed before pushing. The manifest is informational — check its summary line for a false `claude_md_ok`, missing canonical docs, or unresolved links. For a full content audit, run the `/project-review-docs` skill.

See [RELEASING.md](RELEASING.md) for the release process — it runs gates 1 and 2 above against every plugin, plus version-bump steps.

## Pull requests

Internal changes (maintainer or agent-orchestrated) use feature-branch PRs as the canonical workflow:

1. Branch off `master` using the naming convention above.
2. Push the branch to `origin`.
3. Open a PR — all three pre-push gates must be green before opening. When a taskmgr task exists, the PR body must carry `Closes <task-id>`: `scripts/check-gate2-evidence.sh` parses that line to find the task holding the gate-2 evidence, and fails the release for any validator-surface PR it cannot link.
4. Merge after review. Merges use GitHub's default merge-commit style (produces `Merge pull request #N from ...` commits).

External contributors fork the repo, branch off their fork's `master`, and open a PR from their fork branch. The same pre-push checklist applies before opening the PR.

## Task tracking

Tasks are tracked with the `taskmgr` CLI via the `tasks` plugin. Typical workflow: `taskmgr ready` to find available work, `taskmgr create` to capture follow-ups discovered while working, `taskmgr close` when a task is done. See [the `tasks` skill](../plugins/tasks/skills/tasks/SKILL.md) for the full workflow.
