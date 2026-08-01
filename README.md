# claude-dev-tools

A plugin marketplace for [Claude Code](https://claude.ai/code). Each plugin is a self-contained unit — skills, agents, hooks, or themes — that extends Claude Code's capabilities in a specific domain.

For the repo layout and architecture, see [docs/OVERVIEW.md](docs/OVERVIEW.md).

## Plugins

Row order matches `.claude-plugin/marketplace.json`, which carries the long-form description the installer shows.

| Plugin | Description |
|---|---|
| [`tasks`](plugins/tasks/) | Drive the `taskmgr` file-based tracker — `tasks` (data model and commands), `tasks-create`, and the `tasks-work` implement/verify/record workflow. |
| [`project-review`](plugins/project-review/) | Read-only adversarial audits that return a prioritized action list — `project-review-codebase` and `project-review-docs`. |
| [`project-execute`](plugins/project-execute/) | Run a project's own documented flows from its docs — `project-exec-testing`, `project-exec-releasing`, `project-exec-monitoring`, and `project-explain`. |
| [`challenge`](plugins/challenge/) | Project-agnostic adversarial passes — `grill` (stress-test a plan), `kiss` (cut accidental complexity), `are-you-sure` (re-check finished work). |
| [`github-releases`](plugins/github-releases/) | Language-agnostic GitHub release workflow with quality gates, semver, and release notes. |
| [`claude-catppuccin`](plugins/claude-catppuccin/) | Catppuccin color themes for Claude Code: Latte, Frappe, Macchiato, Mocha. |
| [`keep-awake-linux`](plugins/keep-awake-linux/) | Hooks that block Linux system sleep while Claude Code works, releasing on idle or session exit — `keep-awake-inspect` reads the state. |
| [`html-visualization`](plugins/html-visualization/) | Browser HTML that sends the user's response back to Claude — `html-visualize-ask`, `html-visualize-feedback`, `html-visualize-page`. |
| [`project-auto-work`](plugins/project-auto-work/) | Unattended audits that report but never write code — `test-tests` (mutation-based test-suite strength) and `test-app` (exploratory app testing). |
| [`instruction-writing`](plugins/instruction-writing/) | Standards for the artifacts a harness reads — `writing-project-docs` (the canonical doc set) and `writing-skills` (skill authoring). |

## Installation

This repo is a Claude Code marketplace. Inside Claude Code, add the marketplace and install plugins from it:

```
/plugin marketplace add hk9890/claude-dev-tools
/plugin install <plugin-name>@claude-dev-tools
```

`/plugin install` records the plugin as `"<plugin-name>@claude-dev-tools": true` under `enabledPlugins` in `.claude/settings.json`.

## Usage

Most plugins ship skills. Describe the task and Claude loads the matching skill on its own; invoke one by name to force it:

```
/grill
/project-review-docs
```

## Contributing

See [AGENTS.md](AGENTS.md) for the doc map and the workflow each task loads.

## License

[MIT](LICENSE) © Hans Kohlreiter
