# Testing a Plugin

How to run this marketplace's automated suites and validators. To launch and drive plugins by hand — reproduce a bug or verify a change — see [RUNNING.md](RUNNING.md).

## mise tasks

A `.mise.toml` at the repo root provides a single discoverable entry point. Run `mise tasks` to list them, then `mise run <task>`:

| Task | What it runs |
|---|---|
| `mise run test` | Full test suite — all plugins (`tests/run-all.sh`) |
| `mise run test-html` | html-visualization browser/server tests only |
| `mise run check-consistency` | Cross-reference and version-mirror validation (`scripts/check-internal-consistency.py`) |
| `mise run analyze-sessions` | Session-transcript analyser — usage in [MONITORING.md](MONITORING.md) |
| `mise run lint` | ShellCheck (`--severity=warning`) over every tracked shell script (`scripts/list-shell-scripts.sh`: every tracked `*.sh`, plus plugin `bin/` scripts with a shell shebang) — reproduces the CI `shellcheck` job |

Required on PATH: `bash`, `python3`, `node`, `jq`, `shellcheck`. `mise` runs the tasks but installs none of them — `.mise.toml` declares no `[tools]`. Absent `node`, the node-backed suites fail rather than skip.

## Script tests — `tests/run-all.sh`

In-repo script tests live under `tests/` (see [tests/README.md](../tests/README.md) for the layout and the path-resolution idiom). Run them with:

```bash
bash tests/run-all.sh                       # every suite
bash tests/run-all.sh <plugin>              # one plugin
bash tests/<plugin>/script-tests/test-x.sh  # one suite
```

`tests/run-all.sh` discovers every suite, per-plugin and marketplace alike.

### Writing a test

A suite is a `test-*.sh` script under `tests/<plugin>/script-tests/` (or `tests/marketplace/script-tests/`); `run-all.sh` discovers every `test-*.sh` at that depth. A plugin earns a suite when it ships committed bash, python, or JS helpers worth testing. Model a new one on an existing suite — e.g. [`test-manifest.sh`](../tests/project-review/script-tests/test-manifest.sh) — resolving the script under test via `git rev-parse --show-toplevel`. A suite exits `0` on pass, `1` on failure, `77` to skip.

A suite covering a JS workflow script is a `test-*.sh` wrapper that guards `node` on PATH and `exec node`s a sibling `test-*.js` — model it on [`test-review-docs.sh`](../tests/project-review/script-tests/test-review-docs.sh).

### analyze-sessions fixture check

The `analyze-sessions` monitoring script has a regression suite: a synthetic fixture and expected output under `scripts/fixtures/`, run automatically by `tests/run-all.sh` (via `tests/marketplace/script-tests/test-analyze-sessions.sh`). To run it by hand:

```bash
python3 scripts/analyze-sessions.py --fixture scripts/fixtures/session-fixture.jsonl
python3 tests/marketplace/script-tests/check-fixture.py \
    --actual output/session-analysis/fixture/dataset.json \
    --expected scripts/fixtures/session-fixture-expected.json \
    --summary output/session-analysis/fixture/summary.md
```

### Optional prerequisites

Two suites skip rather than fail where their prerequisite is absent:

- `tests/html-visualization/script-tests/test-browser.sh` skips without Playwright in the npm `_npx` cache; `REQUIRE_BROWSER=1` makes it fail instead.

  ```bash
  npx playwright --version        # populates the npm _npx cache
  npx playwright install chromium
  ```

- `tests/keep-awake-linux/script-tests/test-keep-awake.sh` skips where logind will not register an inhibitor (so it skips on GitHub Actions); `REQUIRE_LOGIND=1` makes it fail instead.

## Docs validation

Neither validator below runs in CI — run them locally on any change under `docs/`, from the repo root:

```bash
SCR=plugins/project-review/skills/project-review-docs/scripts
python3 "$SCR/validate-routes.py" . --include-docs   # hard-fails on broken routes
python3 "$SCR/manifest.py" . --format=text           # CLAUDE.md invariant, missing/hollow docs, dead links
```

A non-zero `validate-routes.py` (broken routes) must be fixed before pushing. The manifest is informational — check its summary line for a false `claude_md_ok`, missing canonical docs, or unresolved links. For a full content audit, run the `/project-review-docs` skill.

## CI — `.github/`

`ci.yml` runs five jobs on every PR against `master` and on every push to `master`. All five must be green to merge; four have a local equivalent, so a clean local run predicts a clean CI run — but not a fully verified change: the doc validators above run in no job.

| Job | What it checks | Locally |
|---|---|---|
| `test` | Full script-test suite | `mise run test` |
| `consistency` | Cross-references, version mirrors, marketplace | `mise run check-consistency` |
| `manifests` | JSON well-formedness of every plugin and marketplace manifest | `for f in .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json; do jq empty "$f"; done` |
| `shellcheck` | ShellCheck at `--severity=warning` over every tracked shell script (see `scripts/list-shell-scripts.sh`) | `mise run lint` |
| `gitleaks` | Leaked-secret scan over full history | CI-only (needs the `gitleaks` binary) |

`codeql.yml` adds a CodeQL analysis on the same triggers plus a weekly scheduled scan, and `.github/dependabot.yml` (not a workflow) keeps the pinned GitHub Actions current. Neither has a local equivalent.

## Structural validation — `plugin-dev:plugin-validator`

> **Prerequisite:** `plugin-dev:plugin-validator` ships in the external `plugin-dev` plugin (from the `claude-code-plugins` marketplace at `anthropics/claude-code`), not in this repo. Install it inside Claude Code with `/plugin marketplace add anthropics/claude-code` and `/plugin install plugin-dev@claude-code-plugins`.

The `plugin-dev:plugin-validator` agent validates plugin structure automatically. Ask it to validate a plugin after creating or modifying components:

```
Validate the plugin at plugins/my-plugin
```

It checks:
- `plugin.json` manifest (required fields, format)
- Command, agent, and skill frontmatter
- Hook schema and script references
- File organisation and naming conventions

Use this before publishing or after any structural changes.

The same plugin ships `plugin-dev:skill-reviewer`, a dev-time aid for `SKILL.md` quality rather than a gate — see [CODING.md](CODING.md).
