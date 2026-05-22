# project-ops

Operational skills for running a project's core workflows with Claude Code.

## Overview

This plugin provides command-style skills that *execute* project workflows — running tests, cutting releases, and analyzing monitoring data. Each skill follows the same shape:

1. Discover and load any installed topic skills (testing, release, monitoring).
2. Read the matching canonical doc for repo-specific guidance.
3. Perform the action and report results.

The skills make no assumptions about how a project works — they derive everything from installed topic skills and the canonical docs. If neither exists for a topic, the skill stops and asks the user to create the corresponding doc. If the available guidance is ambiguous (e.g. several kinds of tests defined), the skill asks the user which path to take rather than guessing.

> This plugin declares a dependency on [`project-docs`](../project-docs), which establishes the canonical docs taxonomy (`docs/TESTING.md`, `docs/RELEASING.md`, `docs/MONITORING.md`) these skills read. Installing `project-ops` auto-installs `project-docs`.

## Skills

| Skill | Invocation | Description |
|---|---|---|
| project-run-tests | `/project-ops:project-run-tests` | Run the project's tests, guided by testing skills and `docs/TESTING.md` |
| project-trigger-release | `/project-ops:project-trigger-release` | Cut a new release, guided by release skills and `docs/RELEASING.md` |
| project-analyze-monitoring-data | `/project-ops:project-analyze-monitoring-data` | Analyze monitoring data, guided by monitoring skills and `docs/MONITORING.md` |

## Usage

Run any skill from the list above. Each takes an optional advisory argument:

- **project-run-tests** — runs the tests the docs and skills define; asks which to run when several kinds of tests are defined; optional argument resolves that ambiguity.
- **project-trigger-release** — runs the release process the docs and skills define; asks when the release type or version bump is ambiguous; confirms before outward-facing steps.
- **project-analyze-monitoring-data** — analyzes monitoring data (read-only) for the last 24 hours; asks which sources to cover when several are defined; optional argument sets the window or scope.

## Plugin Structure

```
project-ops/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    ├── project-run-tests/
    │   └── SKILL.md
    ├── project-trigger-release/
    │   └── SKILL.md
    └── project-analyze-monitoring-data/
        └── SKILL.md
```
