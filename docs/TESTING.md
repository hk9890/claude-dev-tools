# Testing a Plugin

How to run this marketplace's automated suites and validators. To launch and drive plugins by hand — reproduce a bug or verify a change — see [RUNNING.md](RUNNING.md).

## mise tasks

A `.mise.toml` at the repo root provides a single discoverable entry point. Run `mise tasks` to list them, then `mise run <task>`:

| Task | What it runs |
|---|---|
| `mise run test` | Full test suite — all plugins (`tests/run-all.sh`) |
| `mise run test-html` | html-visualization browser/server tests only |
| `mise run check-consistency` | Cross-reference and version-mirror validation (`scripts/check-internal-consistency.py`) |
| `mise run analyze-sessions` | Session-transcript analyser (append options as extra args, e.g. `mise run analyze-sessions --help`) |
| `mise run lint` | ShellCheck (`--severity=warning`) over every tracked `*.sh` — reproduces the CI `shellcheck` job |

## Script tests — `tests/run-all.sh`

In-repo script tests live under `tests/` (see [tests/README.md](../tests/README.md)). Run them with:

```bash
bash tests/run-all.sh
```

A plugin has a `tests/<plugin-name>/script-tests/` suite only when it ships committed bash/python helpers worth testing (e.g., the `project-review` validator scripts); plugins without script-level tests have no `tests/` subdirectory at all. A repo-level suite under `tests/marketplace/script-tests/` covers marketplace-wide helpers such as `scripts/check-internal-consistency.py`. `tests/run-all.sh` discovers and runs every suite, per-plugin and marketplace alike.

### Writing a test

A suite is a `test-*.sh` script under `tests/<plugin>/script-tests/` (or `tests/marketplace/script-tests/`); `run-all.sh` discovers every `test-*.sh` at that depth. Model a new one on an existing suite — e.g. [`test-manifest.sh`](../tests/project-review/script-tests/test-manifest.sh) — resolving the script under test via `git rev-parse --show-toplevel` (see [tests/README.md](../tests/README.md) for the path-resolution idiom). A suite exits `0` on pass, `1` on failure, `77` to skip.

### analyze-sessions fixture check

The `analyze-sessions` monitoring script has a regression suite: a synthetic fixture and expected output under `scripts/fixtures/`, run automatically by `tests/run-all.sh` (via `tests/marketplace/script-tests/test-analyze-sessions.sh`). To run it by hand:

```bash
python3 scripts/analyze-sessions.py --fixture scripts/fixtures/session-fixture.jsonl
python3 tests/marketplace/script-tests/check-fixture.py \
    --actual output/session-analysis/fixture/dataset.json \
    --expected scripts/fixtures/session-fixture-expected.json \
    --summary output/session-analysis/fixture/summary.md
```

### Optional prerequisite: Playwright (browser suite)

The html-visualization browser suite (`tests/html-visualization/script-tests/test-browser.sh`) needs Playwright with Chromium, resolved from the npm `_npx` cache. On machines without it, the suite prints `SKIP` and exits with the skip code (77); `tests/run-all.sh` reports it as a skipped suite in its summary line (not a silent pass) and keeps the overall run green. Set `REQUIRE_BROWSER=1` to turn an absent Playwright into a hard failure instead — use this in CI that must exercise the browser path. To enable the suite:

```bash
npx playwright --version        # populates the npm _npx cache
npx playwright install chromium
```

## CI — `.github/workflows/`

`ci.yml` runs five jobs on every PR against `master` and on every push to `master`. All five must be green to merge; four have a local equivalent, so a clean local run should predict a clean CI run:

| Job | What it checks | Locally |
|---|---|---|
| `test` | Full script-test suite | `mise run test` |
| `consistency` | Cross-references, version mirrors, marketplace | `mise run check-consistency` |
| `manifests` | JSON well-formedness of every plugin and marketplace manifest | `for f in .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json; do jq empty "$f"; done` |
| `shellcheck` | ShellCheck at `--severity=warning` over every tracked `*.sh` | `mise run lint` |
| `gitleaks` | Leaked-secret scan over full history | CI-only (needs the `gitleaks` binary) |

`codeql.yml` adds a CodeQL analysis on the same triggers plus a weekly scheduled scan, and `dependabot.yml` keeps the pinned GitHub Actions current. Neither has a local equivalent.

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

## Skill quality review — `plugin-dev:skill-reviewer` (dev-time, not a release gate)

> **Prerequisite:** Same as `plugin-dev:plugin-validator` above — `plugin-dev:skill-reviewer` ships in the external `plugin-dev` plugin and must be installed separately.

The `plugin-dev:skill-reviewer` agent reviews `SKILL.md` files for trigger description quality, progressive disclosure, and content organisation. This is a recommended development-time tool; it is **not** a required release gate (only `plugin-dev:plugin-validator` is).

```
Review the skill at plugins/my-plugin/skills/my-skill/SKILL.md
```

Use this after writing or revising a skill to catch weak trigger phrases, over-long bodies, or missing references.
