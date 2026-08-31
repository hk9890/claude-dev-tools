# claude-dev-tools

A plugin marketplace for [Claude Code](https://claude.ai/code). Each plugin is a self-contained unit — skills, agents, hooks, or themes — that extends Claude Code's capabilities in a specific domain.

## Plugins

| Plugin | Description |
|---|---|
| [`tasks`](plugins/tasks/) | Work a taskmgr tracker from Claude Code — `tasks-core` hands the model taskmgr's own guide, and seven typed skills cover the jobs you repeat: `tasks-create`, `tasks-next`, `tasks-overview`, `tasks-start`, `tasks-close`, `tasks-groom`, `tasks-handover`. |
| [`project-review`](plugins/project-review/) | Read-only adversarial audits that return a prioritized action list — `project-review-change`, `project-review-codebase` and `project-review-docs`. |
| [`project-execute`](plugins/project-execute/) | Run a project's own documented flows from its docs — `project-exec-testing`, `project-exec-releasing`, `project-exec-monitoring`, `project-exec-reviewing`, `project-exec-running`, and `project-explain`; `project-exec-init` writes the doc set those flows are read from. |
| [`challenge`](plugins/challenge/) | Project-agnostic adversarial passes — `grill` (stress-test a plan), `kiss` (cut accidental complexity), `are-you-sure` (re-check finished work), `what-do-you-mean` (re-pitch a message that did not land). |
| [`github-releases`](plugins/github-releases/) | Language-agnostic GitHub release workflow with quality gates, semver, and release notes. |
| [`claude-catppuccin`](plugins/claude-catppuccin/) | Catppuccin color themes for Claude Code: Latte, Frappe, Macchiato, Mocha. |
| [`keep-awake-linux`](plugins/keep-awake-linux/) | Hooks that block Linux system sleep while Claude Code works, releasing on idle or session exit — `keep-awake-inspect` reads the state. |
| [`html-visualization`](plugins/html-visualization/) | Browser HTML that sends the user's response back to Claude — `html-visualize-ask`, `html-visualize-feedback`, `html-visualize-page`. |
| [`project-auto-work`](plugins/project-auto-work/) | Unattended audits that report but never write code — `test-tests` (mutation-based test-suite strength) and `test-app` (exploratory app testing). |
| [`instruction-writing`](plugins/instruction-writing/) | Standards for the artifacts a harness reads — `writing-project-docs` (the canonical doc set) and `writing-skills` (skill authoring). |
| [`plain-english-output-style`](plugins/plain-english-output-style/) | An output style that puts Claude Code's replies in ASD-STE100 Simplified Technical English: answer before acting, agree or disagree explicitly, no filler. |

## Installation

Inside Claude Code, add the marketplace and install plugins from it:

```
/plugin marketplace add hk9890/claude-dev-tools
/plugin install <plugin-name>@claude-dev-tools
```

## Usage

Most plugins ship skills. Describe the task and Claude loads the matching skill on its own; invoke one by name to force it:

```
/grill
/project-review-docs
```

## Contributing

[AGENTS.md](AGENTS.md) routes every kind of task to the doc that owns it, and [docs/OVERVIEW.md](docs/OVERVIEW.md) is the repo map.

## License

[MIT](LICENSE) © Hans Kohlreiter
