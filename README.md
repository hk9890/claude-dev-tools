# claude-dev-tools

A plugin marketplace for [Claude Code](https://claude.ai/code). Each plugin is a self-contained unit — commands, skills, and agents — that extends Claude Code's capabilities in a specific domain.

## Plugins

| Plugin | Description |
|---|---|
| [`beads-tasks`](plugins/beads-tasks/README.md) | Beads task tracking with tasker, reviewer, and verifier agents |
| [`complexity-review`](plugins/complexity-review/README.md) | Skeptical complexity review for requirements, architecture, and code |
| [`github-releases`](plugins/github-releases/README.md) | Language-agnostic GitHub release workflow with semver and quality gates |
| [`project-docs`](plugins/project-docs/README.md) | Project documentation lifecycle: create, update, improve, and review |
| [`claude-catppuccin`](plugins/claude-catppuccin/README.md) | Visual style for Claude Code: Catppuccin Mocha color theme |

## Installation

Install a plugin from this repo via the Claude Code CLI:

```bash
claude plugin install https://github.com/hanskohlreiter/claude-dev-tools/plugins/<plugin-name>
```

Or reference the path directly in your project's `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "plugin-name@path/to/plugins/plugin-name": true
  }
}
```

See [docs/OVERVIEW.md](docs/OVERVIEW.md) for architecture details and how to add a new plugin.

## Contributing

See [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) for the commit and task-tracking workflow used in this repo.
