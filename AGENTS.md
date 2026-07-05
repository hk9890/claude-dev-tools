# AGENTS.md — claude-dev-tools routing

## Repository purpose

Plugin marketplace for Claude Code. Each subdirectory under `plugins/` is a self-contained plugin.

## Use-case routing

### Research, planning, understanding the repo

Load [docs/OVERVIEW.md](docs/OVERVIEW.md) to understand the architecture and how plugins are structured.

### Making changes, commits, PRs

Load [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) before making commits or opening a PR.

### Reviewing changes

Load [docs/REVIEWING.md](docs/REVIEWING.md) before reviewing a PR or change — follow the project-specific review rules there.

### Developing or contributing a new plugin

Load [docs/CODING.md](docs/CODING.md) for step-by-step plugin creation, rules files, and scaffolding guidance. 
Load [docs/OVERVIEW.md](docs/OVERVIEW.md) for directory layout and architecture reference.

### Testing a plugin

Load [docs/TESTING.md](docs/TESTING.md) for structural validation and the in-repo script tests.

### Running a plugin to reproduce a bug or verify a change

Load [docs/RUNNING.md](docs/RUNNING.md) to launch the plugins locally with `scripts/claude-dev` and drive them by hand — reproduce a reported bug, or smoke-test that a skill, command, or hook works after a change.

### Releasing plugins

Load [docs/RELEASING.md](docs/RELEASING.md) for the version bump, quality gates, and release process.

### Monitoring plugin usage

Load [docs/MONITORING.md](docs/MONITORING.md) for session-analysis scripts, output schema, and how to interpret usage data.
