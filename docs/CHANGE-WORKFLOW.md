# Change Workflow

How a change lands here: commit conventions, branch naming, the pre-push gates, and the PR flow.

## Commits and branches

Call the Skill tool with `commit-commands:commit` (or `commit-commands:commit-push-pr`) for the standard flow. **Local delta:** one logical change per commit; imperative present tense ("Add X", "Fix Y", "Remove Z").

`master` is the protected main branch — no direct pushes from any actor. Branch off it with a prefixed slug that says what the branch does (`docs/feature-branch-policy`): `fix/`, `feat/`, `docs/`, `chore/`. Prefixing an issue or task ID is allowed but never required — nothing here parses it.

## Pre-push checklist

Every applicable gate must pass before each push to a branch. Each is named for what it checks, and the same names are used in [RELEASING.md](RELEASING.md).

- **Test-Run** (always) — `mise run test` must pass. Mirrored by the CI `test` job.
- **Consistency-Check** (always) — `mise run check-consistency` must exit 0. Mirrored by the CI `consistency` job.
- **Plugin-Structure-Check** (plugin changes only) — run `plugin-dev:plugin-validator` on every changed plugin; zero errors required. Skip it when the change touches none of `.claude-plugin/plugin.json`, `agents/`, `skills/`, `commands/`, or `hooks/`. Put its summary line in the PR body: the validator is an agent, so no CI job can enforce it and nothing audits it afterwards. A result stands for the commit it ran on: rerun it for a plugin whose files changed since, and name the commit in the summary line. It ships in the external `plugin-dev` plugin ([TESTING.md](TESTING.md)).
- **Docs-Route-Check** (any change to `AGENTS.md`, `CLAUDE.md`, `README.md`, or a file under `docs/`) — `validate-routes.py` must exit 0; the Docs validation section in TESTING.md carries the commands.
- **Shell-Lint** (any shell script change: a `*.sh`, or an extensionless script under a plugin's `bin/`) — `mise run lint` must pass. Mirrored by the CI `shellcheck` job.

## Pull requests

Every change lands through a PR:

1. Branch off `master` per the convention above.
2. Run every applicable gate, then push the branch to `origin` and open a PR.
3. Review it: call the Skill tool with `worktree-flow:worktree-review` and the argument `<pr>`, against [REVIEWING.md](REVIEWING.md); `/worktree-flow:worktree-ship` runs it.
4. Merge once all five CI jobs are green ([TESTING.md](TESTING.md)), with `gh pr merge <pr> --merge`, or ask the user to run `/worktree-flow:worktree-merge <pr>`, which also removes the worktree and the merged branches.
