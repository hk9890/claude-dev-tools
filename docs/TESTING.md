# Testing a Plugin

How to run this marketplace's automated suites and validators.

## mise tasks

`.mise.toml` at the repo root is the single entry point; `mise tasks` lists the tasks and what each runs. `mise run test` is the full suite and runs `tests/run-all.sh`.

`bash`, `perl`, `python3`, `node`, `jq`, `rsync`, and `shellcheck` must already be on PATH: `.mise.toml` declares no `[tools]`, so mise runs the tasks but installs none of them. Absent `node`, the node-backed suites fail rather than skip. The plugin suite alone needs `claude` too ([Suites that skip](#suites-that-skip)).

## Script tests — `tests/run-all.sh`

Suites live under `tests/` — [tests/README.md](../tests/README.md) has the layout and the path-resolution idiom.

```bash
mise run test                               # every suite, per-plugin and marketplace alike
bash tests/run-all.sh <plugin>              # one plugin
bash tests/<plugin>/script-tests/test-x.sh  # one suite
```

### Writing a test

A suite is a `test-*.sh` under `tests/<plugin>/script-tests/` or `tests/marketplace/script-tests/`; `run-all.sh` discovers every `test-*.sh` at that depth. A plugin earns one when it ships committed bash, python, or JS helpers worth testing. Exit `0` on pass, `1` on failure, `77` to skip.

- Model a new suite on [`test-manifest.sh`](../tests/project-review/script-tests/test-manifest.sh), resolving the script under test via `git rev-parse --show-toplevel`.
- For a JS workflow script, write a `test-*.sh` wrapper that exits `1` where `node` is not on PATH and `exec node`s a sibling `test-*.js` — model it on [`test-review-docs.sh`](../tests/project-review/script-tests/test-review-docs.sh).

### Suites that skip

Two skip rather than fail where their prerequisite is absent:

- `tests/html-visualization/script-tests/test-browser.sh` — needs Playwright in the npm `_npx` cache: `npx playwright --version` populates it, then `npx playwright install chromium`. `REQUIRE_BROWSER=1` makes it fail instead.
- `tests/marketplace/script-tests/test-claude-plugin.sh` — needs `claude` 2.1.323 or later on PATH, the first release whose `validate --strict` type-checks a hooks module. `REQUIRE_CLAUDE=1` makes it fail instead, and the CI `test` job sets it.

## Mod tests — `claude plugin test`

A mod's tests live inside the plugin, at `plugins/<plugin>/tests/*.test.ts`, and run against the engine with no session, sign-in or network:

```bash
claude plugin validate --strict plugins/<plugin>   # manifest, load-time static analysis, a type check of the hooks module (2.1.323+); fails on a warning, a plugin directory one excepted
claude plugin test plugins/<plugin>                # the plugin's tests
```

`test-claude-plugin.sh` (above) runs the validation for every plugin and the repo root's `marketplace.json`, and the tests for every plugin whose `hooks/hooks.json` has a `modules` key, so `mise run test` covers them.

### Writing a mod test

- The test stands for the host: register a hook for every event and `$` call the mod reaches (`process.run`, `ui.status`, `session.id`), or the call fails with `no implementation for <event>`.
- A stub for a `$` call answers `{ value: ... }`; a stub for an event answers the event's own result.
- Drive time with `mock.clock(on)` and `clock.advance(ms)`.
- Model a new test on the one nearest in shape: [`worktree-flow.test.ts`](../plugins/worktree-flow/tests/worktree-flow.test.ts) (denied tool calls), [`tasks-board.test.tsx`](../plugins/tasks/tests/tasks-board.test.tsx) (a command and a mounted pane), [`keep-awake.test.ts`](../plugins/keep-awake-linux/tests/keep-awake.test.ts) (a spawned child's life, timers, plugin options).

## Skill trigger evals — `mise run eval`

The `claude plugin eval` cases in `plugins/instruction-writing/evals/` check that `writing-skills` fires on a skill request and not on an `AGENTS.md` request. A run costs about 1.20 USD, so no CI job runs it: [RELEASING.md](RELEASING.md#release-steps) asks the user first.

## Docs validation

Neither validator runs in CI — run both locally on any change to `AGENTS.md`, `CLAUDE.md`, `README.md`, or a file under `docs/`, from the repo root:

```bash
SCR=plugins/project-review/skills/project-review-docs/scripts
python3 "$SCR/validate-routes.py" . --include-docs   # hard-fails on broken routes
python3 "$SCR/manifest.py" . --format=text           # CLAUDE.md invariant, missing/hollow docs, dead links
```

The manifest is informational — check its summary line for a false `claude_md_ok`, missing canonical docs, or unresolved links.
## CI — `.github/`

`ci.yml` runs five jobs on every PR against `master` and every push to `master`; all five must be green to merge. Four have a local equivalent; the doc validators above run in no job.

| Job | What it checks | Locally |
|---|---|---|
| `test` | Full script-test suite, the plugin suite included: the job installs the latest Claude Code, so a new release can fail it with no change here; the suite log names the version | `mise run test` |
| `consistency` | Cross-references, version mirrors, marketplace | `mise run check-consistency` |
| `manifests` | JSON well-formedness of every plugin and marketplace manifest | `for f in .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json; do jq empty "$f"; done` |
| `shellcheck` | ShellCheck over every tracked shell script | `mise run lint` |
| `gitleaks` | Leaked-secret scan over full history | CI-only (needs the `gitleaks` binary) |

`codeql.yml` adds CodeQL analysis on the same triggers plus a weekly scan, and `.github/dependabot.yml` keeps the pinned GitHub Actions current. Neither has a local equivalent.

## Structural validation — `plugin-dev:plugin-validator`

Install the external `plugin-dev` inside Claude Code:

```
/plugin marketplace add anthropics/claude-code
/plugin install plugin-dev@claude-code-plugins
```

The `plugin-dev:plugin-validator` agent checks a plugin's manifest, component frontmatter, hook schema, and file organisation. [CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md#pre-push-checklist) and [RELEASING.md](RELEASING.md) say when it runs. Invoke it as:

```
Validate the plugin at plugins/my-plugin
```
