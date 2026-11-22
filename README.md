# claude-dev-tools

A plugin marketplace for [Claude Code](https://claude.ai/code). Each plugin is a self-contained unit — skills, agents, mods, themes, or output styles — that extends Claude Code's capabilities in a specific domain.

## Plugins

| Plugin | Description |
|---|---|
| [`tasks`](plugins/tasks/) | Work a taskmgr tracker from Claude Code — `tasks-core` hands the model taskmgr's own guide, and seven typed skills cover the jobs you repeat: `tasks-create`, `tasks-next`, `tasks-overview`, `tasks-start`, `tasks-close`, `tasks-groom`, `tasks-handover`. `/tasks-board` draws the tracker in a pane without a model turn (needs Claude Code 2.1.287+). |
| [`project-review`](plugins/project-review/) | Read-only adversarial audits that return a prioritized action list — `project-review-change` (with `--fix` it also applies its settled fixes), `project-review-codebase` and `project-review-docs` — and `project-review-session`, a retrospective on one coding session. |
| [`project-execute`](plugins/project-execute/) | Run a project's own documented flows from its docs — `project-exec-testing`, `project-exec-releasing`, `project-exec-monitoring`, `project-exec-reviewing`, `project-exec-running`, and `project-explain`; `project-exec-init` writes the doc set those flows are read from. |
| [`challenge`](plugins/challenge/) | Project-agnostic adversarial passes — `grill` (stress-test a plan), `kiss` (cut accidental complexity), `are-you-sure` (re-check finished work), `what-do-you-mean` (re-pitch a message that did not land). |
| [`github-releases`](plugins/github-releases/) | Language-agnostic GitHub release workflow with quality gates, semver, and release notes. |
| [`catppuccin-themes`](plugins/catppuccin-themes/) | Catppuccin color themes for Claude Code: Latte, Frappe, Macchiato, Mocha. |
| [`keep-awake-linux`](plugins/keep-awake-linux/) | A mod that blocks Linux system sleep while Claude Code works, releasing on idle or session exit — `/keep-awake-info` shows in a live pane which Claude sessions block sleep. Needs Claude Code 2.1.287+. |
| [`html-visualization`](plugins/html-visualization/) | Browser HTML that sends the user's response back to Claude — `html-visualize-ask`, `html-visualize-feedback`, `html-visualize-page`. |
| [`project-auto-work`](plugins/project-auto-work/) | Unattended audits — `test-tests` (mutation-based test-suite strength) and `test-app` (exploratory app testing). With a taskmgr store they file what they find, and `test-tests` opens PRs for settled survivors it can prove fixed. |
| [`instruction-writing`](plugins/instruction-writing/) | Standards for the artifacts a harness reads — `writing-project-docs` (the canonical doc set) and `writing-skills` (skill authoring). |
| [`plain-english-output-style`](plugins/plain-english-output-style/) | An output style that puts Claude Code's replies in ASD-STE100 Simplified Technical English: answer before acting, agree or disagree explicitly, no filler. |
| [`worktree-flow`](plugins/worktree-flow/) | A mod that steers Claude from `git worktree add` in the session's repository to the `EnterWorktree` tool, plus `worktree-ship` (worktree to reviewed PR), `worktree-review` (the review of a PR: the project's rules, then the code, with the fixes pushed) and `worktree-merge` (merge, then remove the worktree and branches, and close the issues it resolved). Needs Claude Code 2.1.287+. |
| [`revier`](plugins/revier/) | Reach the other projects on this machine through the [revier](https://github.com/hk9890/revier) CLI: list projects and their agents, read a project's source, prompt another agent, and see recent use. A mod blocks the commands that open, raise or close a window. Needs Claude Code 2.1.287+. |
| [`werft`](plugins/werft/) | Disposable test VMs on a libvirt host through the [werft](https://github.com/hk9890/werft) CLI. The `werft` skill leases a VM, uses it over SSH and releases it. A mod runs those commands without a permission prompt, in the default permission mode too, and releases the session's leases when the session ends. Needs Claude Code 2.1.287+ and werft v0.5.0+. |
| [`web-dev`](plugins/web-dev/) | Web apps in a headless browser through [playwright-cli](https://github.com/microsoft/playwright-cli) — the `web-drive` skill starts a web app the way the project documents it, uses it in a browser no one sees, and records a video of each feature working; `/web-dev:web-perf` measures page load with chrome-devtools traces and Lighthouse; and a mod denies the playwright-cli, Playwright Test, chrome-devtools and Lighthouse commands and the URL openers (xdg-open and its kin) that would open a browser window on your screen, and the playwright-cli commands that close the browsers of other sessions or name no session. Needs Claude Code 2.1.287+ and playwright-cli; `web-perf` also needs `chrome-devtools-mcp`, and `lighthouse` for the score. |

## Installation

Inside Claude Code, add the marketplace and install plugins from it:

```
/plugin marketplace add hk9890/claude-dev-tools
/plugin install <plugin-name>@claude-dev-tools
```

## Usage

Most plugins ship skills. Run one by typing its name — most start only that way; a few also load on their own when you describe the task:

```
/grill
/project-review-docs
```

## Contributing

[AGENTS.md](AGENTS.md) routes every kind of task to the doc that owns it, and [docs/OVERVIEW.md](docs/OVERVIEW.md) is the repo map.

## License

[MIT](LICENSE) © Hans Kohlreiter
