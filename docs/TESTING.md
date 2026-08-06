# Testing a Plugin

How to run this marketplace's automated suites and validators. To launch and drive plugins by hand, see [RUNNING.md](RUNNING.md).

## mise tasks

`.mise.toml` at the repo root is the single entry point; `mise tasks` lists them.

| Task | What it runs |
|---|---|
| `mise run test` | Full test suite — every plugin (`tests/run-all.sh`) |
| `mise run test-html` | html-visualization browser/server tests only |
| `mise run check-consistency` | Cross-reference and version-mirror validation (`scripts/check-internal-consistency.py`) |
| `mise run lint` | ShellCheck `--severity=warning` over every tracked shell script (`scripts/list-shell-scripts.sh`) |
| `mise run analyze-sessions` | Session-transcript analyser — usage in [MONITORING.md](MONITORING.md) |

`bash`, `python3`, `node`, `jq`, and `shellcheck` must already be on PATH: `.mise.toml` declares no `[tools]`, so mise runs the tasks but installs none of them. Absent `node`, the node-backed suites fail rather than skip.

## Script tests — `tests/run-all.sh`

Suites live under `tests/` — [tests/README.md](../tests/README.md) has the layout and the path-resolution idiom.

```bash
bash tests/run-all.sh                       # every suite, per-plugin and marketplace alike
bash tests/run-all.sh <plugin>              # one plugin
bash tests/<plugin>/script-tests/test-x.sh  # one suite
```

### Writing a test

A suite is a `test-*.sh` under `tests/<plugin>/script-tests/` or `tests/marketplace/script-tests/`; `run-all.sh` discovers every `test-*.sh` at that depth. A plugin earns one when it ships committed bash, python, or JS helpers worth testing. Exit `0` on pass, `1` on failure, `77` to skip.

- Model a new suite on [`test-manifest.sh`](../tests/project-review/script-tests/test-manifest.sh), resolving the script under test via `git rev-parse --show-toplevel`.
- For a JS workflow script, write a `test-*.sh` wrapper that guards `node` on PATH and `exec node`s a sibling `test-*.js` — model it on [`test-review-docs.sh`](../tests/project-review/script-tests/test-review-docs.sh).

### Suites that skip

Two skip rather than fail where their prerequisite is absent:

- `tests/html-visualization/script-tests/test-browser.sh` — needs Playwright in the npm `_npx` cache: `npx playwright --version` populates it, then `npx playwright install chromium`. `REQUIRE_BROWSER=1` makes it fail instead.
- `tests/keep-awake-linux/script-tests/test-keep-awake.sh` — needs logind to register an inhibitor, so it skips on GitHub Actions. `REQUIRE_LOGIND=1` makes it fail instead.

### analyze-sessions fixture check

`tests/run-all.sh` runs this regression suite via `tests/marketplace/script-tests/test-analyze-sessions.sh`. By hand:

```bash
python3 scripts/analyze-sessions.py --fixture scripts/fixtures/session-fixture.jsonl
python3 tests/marketplace/script-tests/check-fixture.py \
    --actual output/session-analysis/fixture/dataset.json \
    --expected scripts/fixtures/session-fixture-expected.json \
    --summary output/session-analysis/fixture/summary.md
```

## Docs validation

Neither validator runs in CI — run both locally on any change under `docs/`, from the repo root:

```bash
SCR=plugins/project-review/skills/project-review-docs/scripts
python3 "$SCR/validate-routes.py" . --include-docs   # hard-fails on broken routes
python3 "$SCR/manifest.py" . --format=text           # CLAUDE.md invariant, missing/hollow docs, dead links
```

A non-zero `validate-routes.py` must be fixed before pushing. The manifest is informational — check its summary line for a false `claude_md_ok`, missing canonical docs, or unresolved links. For a full content audit, run `/project-review-docs`.

## CI — `.github/`

`ci.yml` runs five jobs on every PR against `master` and every push to `master`; all five must be green to merge. Four have a local equivalent, so a clean local run predicts a clean CI run — but not a fully verified change: the doc validators above run in no job.

| Job | What it checks | Locally |
|---|---|---|
| `test` | Full script-test suite | `mise run test` |
| `consistency` | Cross-references, version mirrors, marketplace | `mise run check-consistency` |
| `manifests` | JSON well-formedness of every plugin and marketplace manifest | `for f in .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json; do jq empty "$f"; done` |
| `shellcheck` | ShellCheck over every tracked shell script | `mise run lint` |
| `gitleaks` | Leaked-secret scan over full history | CI-only (needs the `gitleaks` binary) |

`codeql.yml` adds CodeQL analysis on the same triggers plus a weekly scan, and `.github/dependabot.yml` keeps the pinned GitHub Actions current. Neither has a local equivalent.

## Structural validation — `plugin-dev:plugin-validator`

`plugin-dev` ships in the external `claude-code-plugins` marketplace, not in this repo. Install it inside Claude Code:

```
/plugin marketplace add anthropics/claude-code
/plugin install plugin-dev@claude-code-plugins
```

The `plugin-dev:plugin-validator` agent checks a plugin's manifest, component frontmatter, hook schema, and file organisation. Run it after creating or modifying components, and over every plugin before a release ([RELEASING.md](RELEASING.md)):

```
Validate the plugin at plugins/my-plugin
```

The same plugin ships `plugin-dev:skill-reviewer`, a dev-time aid for `SKILL.md` quality rather than a gate — see [CODING.md](CODING.md).
