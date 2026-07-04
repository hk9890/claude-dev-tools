# Testing a Plugin

How to run this marketplace's automated suites and validators. To launch and drive plugins by hand — reproduce a bug or verify a change — see [RUNNING.md](RUNNING.md).

## Make targets

A `Makefile` at the repo root provides a single discoverable entry point. Run `make` (or `make help`) to see all targets:

| Target | What it runs |
|---|---|
| `make test` | Full test suite — all plugins (`tests/run-all.sh`) |
| `make test-html` | html-visualization browser/server tests only |
| `make check-consistency` | Cross-reference and version-mirror validation (`scripts/check-internal-consistency.py`) |
| `make analyze-sessions` | Session-transcript analyser (use `ARGS=` to pass options) |
| `make lint` | No linter configured — prints a notice and exits 0 |

## Script tests — `tests/run-all.sh`

In-repo script tests live under `tests/` (see [tests/README.md](../tests/README.md)). Run them with:

```bash
bash tests/run-all.sh
```

A plugin has a `tests/<plugin-name>/script-tests/` suite only when it ships committed bash/python helpers worth testing (e.g., `project-quality` validator scripts); plugins without script-level tests have no `tests/` subdirectory at all. A repo-level suite under `tests/marketplace/script-tests/` covers marketplace-wide helpers such as `scripts/check-internal-consistency.py`. `tests/run-all.sh` discovers and runs every suite, per-plugin and marketplace alike.

### Optional prerequisite: Playwright (browser suite)

The html-visualization browser suite (`tests/html-visualization/script-tests/test-browser.sh`) needs Playwright with Chromium, resolved from the npm `_npx` cache. On machines without it, the suite prints `SKIP` and exits with the skip code (77); the `run-all.sh` scripts report it as a skipped suite in their summary line (not a silent pass) and keep the overall run green. Set `REQUIRE_BROWSER=1` to turn an absent Playwright into a hard failure instead — use this in CI that must exercise the browser path. To enable the suite:

```bash
npx playwright --version        # populates the npm _npx cache
npx playwright install chromium
```

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
