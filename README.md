# claude-dev-tools

A plugin marketplace for [Claude Code](https://claude.ai/code). Each plugin is a self-contained unit — commands, skills, and agents — that extends Claude Code's capabilities in a specific domain.

## Repo layout

| Directory | Purpose |
|---|---|
| `plugins/` | One subdirectory per plugin (independently installable) |
| `.claude-plugin/` | Repo-level marketplace manifest (`marketplace.json`) |
| `docs/` | Developer guides (OVERVIEW, CODING, TESTING, REVIEWING, RELEASING, MONITORING, CHANGE-WORKFLOW) |
| `scripts/` | Repo maintenance scripts |
| `tests/` | Structural validation and smoke tests |
| `.tasks/` | taskmgr task store for this repo (file-based, the `taskmgr` issue store) |

See [docs/OVERVIEW.md](docs/OVERVIEW.md) for the full layout and architecture details.

## Plugins

| Plugin | Description |
|---|---|
| [`tasks`](plugins/tasks/README.md) | Use the `taskmgr` file-based task tracker — data model and commands, a skill to turn review findings into well-formed tasks, generic implementer/verifier agents, and a tasks-work workflow that runs ready work through implement, verify, and record |
| [`claude-catppuccin`](plugins/claude-catppuccin/README.md) | Visual style for Claude Code: Catppuccin Mocha color theme |
| [`project-quality`](plugins/project-quality/README.md) | Project-quality toolkit — read-only adversarial reviews (complexity, structure, tests, consistency, docs) runnable individually or as one orchestrated, verified full review, thin human-triggered exec skills (run tests, cut a release, analyze monitoring), and a human-triggered explainer that digests how the project handles a topic from its own docs |
| [`grill`](plugins/grill/README.md) | Adversarial stress-test on demand — grills any plan, design, change, or decision with pointed questions, each carrying a committed recommended answer and a source, then walks them with you one at a time and ends on a clean / needs-answers gate; read-only and project-agnostic, grounded in a generic critical-engineering value base |
| [`github-releases`](plugins/github-releases/README.md) | Language-agnostic GitHub release workflow with quality gates, semver, and release notes |
| [`html-visualization`](plugins/html-visualization/README.md) | Interactive HTML the user opens in a browser — a shared `html-visualize` core skill plus three user-invoked command skills: `html-visualize-ask` (question and decision forms), `html-visualize-feedback` (comment on rendered content), and `html-visualize-demo` (rich visualization with an always-on footer for optional follow-up messages); a shared one-shot Node server captures the response and re-invokes Claude |
| [`keep-awake-linux`](plugins/keep-awake-linux/README.md) | Prevents Linux system sleep while Claude Code is actively working — releases automatically when idle or on session exit |
| [`project-explore`](plugins/project-explore/README.md) | Assisted exploratory testing — researches a project, then plays around with the product one action at a time, filing findings as tasks |

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

## Running tests

A `Makefile` at the repo root provides a single discoverable entry point. Run `make` (or `make help`) to see all targets:

| Target | What it runs |
|---|---|
| `make test` | Full test suite — all plugins (`tests/run-all.sh`) |
| `make test-html` | html-visualization browser/server tests only |
| `make check-consistency` | Cross-reference and version-mirror validation |
| `make analyze-sessions` | Session-transcript analyser (use `ARGS=` to pass options) |
| `make lint` | No linter configured — prints a notice and exits 0 |

## Contributing

See [docs/CODING.md](docs/CODING.md) for how to add a new plugin and [docs/OVERVIEW.md](docs/OVERVIEW.md) for the repo layout, and [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) for the commit and task-tracking workflow used in this repo.
