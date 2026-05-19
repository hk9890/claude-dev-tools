# claude-dev-tools

A plugin marketplace for [Claude Code](https://claude.ai/code). Each plugin is a self-contained unit — commands, skills, and agents — that extends Claude Code's capabilities in a specific domain.

## Repo layout

| Directory | Purpose |
|---|---|
| `plugins/` | One subdirectory per plugin (independently installable) |
| `.claude-plugin/` | Repo-level marketplace manifest (`marketplace.json`) |
| `docs/` | Developer guides (OVERVIEW, CODING, TESTING, RELEASING) |
| `scripts/` | Repo maintenance scripts |
| `tests/` | Structural validation and smoke tests |

See [docs/OVERVIEW.md](docs/OVERVIEW.md) for the full layout and architecture details.

## Plugins

| Plugin | Description |
|---|---|
| [`beads-tasks`](plugins/beads-tasks/README.md) | Beads task tracking with tasker, reviewer, and verifier agents — use with planning mode for full orchestration |
| [`claude-catppuccin`](plugins/claude-catppuccin/README.md) | Visual style for Claude Code: Catppuccin Mocha color theme |
| [`complexity-review`](plugins/complexity-review/README.md) | Skeptical complexity review for requirements, architecture, and code — bias toward simplicity |
| [`github-releases`](plugins/github-releases/README.md) | Language-agnostic GitHub release workflow with quality gates, semver, and release notes |
| [`keep-awake-linux`](plugins/keep-awake-linux/README.md) | Prevents Linux system sleep while Claude Code is actively working — releases automatically when idle or on session exit |
| [`project-docs`](plugins/project-docs/README.md) | Project documentation lifecycle: create, update, improve, and review project docs |

## Installation

This repo is a Claude Code marketplace. Inside Claude Code, add the marketplace and install plugins from it:

```
/plugin marketplace add hanskohlreiter/claude-dev-tools
/plugin install <plugin-name>@claude-dev-tools
```

After installing, the plugin is recorded in your `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "<plugin-name>@claude-dev-tools": true
  }
}
```

## Contributing

See [docs/CODING.md](docs/CODING.md) for how to add a new plugin, and [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) for the commit and task-tracking workflow used in this repo.
