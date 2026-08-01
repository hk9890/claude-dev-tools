# AGENTS.md — claude-dev-tools routing

## Repository purpose

Plugin marketplace for Claude Code. Each subdirectory under `plugins/` is one independently installable plugin.

## Use-case routing

Every route below is **mandatory, not advisory**. Load the document BEFORE the first action of that kind — loading it afterwards does not count, and no route becomes skippable because the task looks small.

### Research, planning, analysis

**MUST read [docs/OVERVIEW.md](docs/OVERVIEW.md) before your first `grep`, `rg`, `Glob`, or `ls` in this repo.** It is the map — repo and plugin layout, where things live, and how to find them fast.

### Coding and file changes

**MUST read [docs/CODING.md](docs/CODING.md) before creating or editing ANY file under `plugins/` or `scripts/`, or `.claude-plugin/marketplace.json`.** It owns plugin scaffolding, marketplace registration, dependency declarations, runtime path resolution, the SKILL.md conventions, and the lint rule binding every tracked shell script.

### Writing project docs

**MUST load the `instruction-writing:writing-project-docs` skill before creating or editing `AGENTS.md`, `README.md`, or ANY file under `docs/`.** It owns which file may carry what, and the authoring rules the pre-push docs gate checks against.

### Testing a plugin

**MUST read [docs/TESTING.md](docs/TESTING.md) before running or writing tests**, or editing ANY file under `tests/` or `.github/workflows/`. It owns the mise tasks, the script-test layout, and the CI gates.

### Run a plugin to reproduce a bug or verify a change

**MUST read [docs/RUNNING.md](docs/RUNNING.md) before launching a plugin locally** or driving a skill, command, or hook by hand.

### Commit, branch, PR workflow

**MUST read [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) before ANY git operation** — commit, branch, push, or opening a PR.

### Reviewing changes

**MUST read [docs/REVIEWING.md](docs/REVIEWING.md) before reviewing a PR or a diff.** It carries the local review priorities and out-of-scope conventions the generic review skills cannot know.

### Releasing plugins

**MUST read [docs/RELEASING.md](docs/RELEASING.md) before cutting a release** or bumping plugin versions.

### Analyze plugin usage

**MUST read [docs/MONITORING.md](docs/MONITORING.md) before your first read of a `~/.claude/projects/**/*.jsonl` transcript or run of `scripts/analyze-sessions.py`.** It owns the session-analysis workflow and its output schema.
