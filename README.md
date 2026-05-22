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
| [`project-review`](plugins/project-review/README.md) | Multi-perspective adversarial review plugin — complexity, structure, tests, and consistency — bias toward simplicity and coherence |
| [`github-releases`](plugins/github-releases/README.md) | Language-agnostic GitHub release workflow with quality gates, semver, and release notes |
| [`html-ask`](plugins/html-ask/README.md) | Interactive in-browser feedback for multi-decision plans and question batches — Claude renders a question form as HTML, the user answers in-browser, and a one-shot Node server writes the feedback and re-invokes Claude |
| [`keep-awake-linux`](plugins/keep-awake-linux/README.md) | Prevents Linux system sleep while Claude Code is actively working — releases automatically when idle or on session exit |
| [`project-docs`](plugins/project-docs/README.md) | Project documentation lifecycle: create, update, improve, and review project docs |
| [`project-explore`](plugins/project-explore/README.md) | Beads-driven assisted exploratory testing — researches a project, then plays around with the product one action at a time, filing findings as tasks |

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
