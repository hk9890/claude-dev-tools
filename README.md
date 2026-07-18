# claude-dev-tools

A plugin marketplace for [Claude Code](https://claude.ai/code). Each plugin is a self-contained unit — commands, skills, and agents — that extends Claude Code's capabilities in a specific domain.

For the repo layout and architecture, see [docs/OVERVIEW.md](docs/OVERVIEW.md).

## Plugins

| Plugin | Description |
|---|---|
| [`tasks`](plugins/tasks/) | Use the `taskmgr` file-based task tracker — data model and commands, a skill to turn review findings into well-formed tasks, generic implementer/verifier agents, and a tasks-work workflow that runs ready work through implement, verify, and record |
| [`claude-catppuccin`](plugins/claude-catppuccin/) | Visual style for Claude Code: Catppuccin color themes (Latte, Frappe, Macchiato, Mocha) |
| [`project-review`](plugins/project-review/) | Read-only adversarial project reviews — structure, tests, consistency, and docs — each a standalone lens that challenges the artifact against the project's own standards and returns a prioritized action list |
| [`project-execute`](plugins/project-execute/) | Thin human-triggered skills that execute a project's own defined flows — run its tests, cut a release, analyze its monitoring data — plus an explainer that digests how the project handles a given topic from its own docs; every skill follows what the project documents and invents nothing |
| [`challenge`](plugins/challenge/) | On-demand adversarial passes over whatever is in front of you — `grill` stress-tests a plan or decision with pointed questions, `kiss` challenges accidental complexity and simplifies, and `are-you-sure` re-checks finished work against what was actually asked; project-agnostic, applies to anything |
| [`github-releases`](plugins/github-releases/) | Language-agnostic GitHub release workflow with quality gates, semver, and release notes |
| [`html-visualization`](plugins/html-visualization/) | Interactive HTML the user opens in a browser — a shared `html-visualize` core skill plus three user-invoked command skills: `html-visualize-ask` (question and decision forms), `html-visualize-feedback` (comment on rendered content), and `html-visualize-demo` (rich visualization with an always-on footer for optional follow-up messages); a shared one-shot Node server captures the response and re-invokes Claude |
| [`keep-awake-linux`](plugins/keep-awake-linux/) | Prevents Linux system sleep while Claude Code is actively working — releases automatically when idle or on session exit |
| [`project-explore`](plugins/project-explore/) | Assisted exploratory testing — researches a project, then plays around with the product one action at a time, filing findings as tasks |
| [`project-auto-work`](plugins/project-auto-work/) | Unattended adversarial audits that work the project on their own and report back — first skill `test-tests`: an empirical, language-independent test-suite strength audit that injects mutants, no-op edits, and delays to prove whether the tests actually detect bugs; reports findings and proposals, never keeps an edit |

## Installation

This repo is a Claude Code marketplace. Inside Claude Code, add the marketplace and install plugins from it:

```
/plugin marketplace add hk9890/claude-dev-tools
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

See [docs/CODING.md](docs/CODING.md) for how to add a new plugin, [docs/OVERVIEW.md](docs/OVERVIEW.md) for the repo layout, [docs/TESTING.md](docs/TESTING.md) for running the test suites, and [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) for the commit and task-tracking workflow used in this repo.

## License

[MIT](LICENSE) © Hans Kohlreiter
