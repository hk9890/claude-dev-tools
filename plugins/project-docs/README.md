# project-docs

Project documentation lifecycle management for Claude Code.

## Overview

This plugin provides structured workflows for creating, updating, improving, and reviewing project documentation. It establishes canonical doc taxonomy and keeps AGENTS.md routing aligned with the repository.

## Skills

| Skill | Invocation | Description |
|---|---|---|
| project-create-docs | `/project-docs:project-create-docs` | Create or initialize project docs baseline from scratch |
| project-init-or-update-docs | `/project-docs:project-init-or-update-docs` | Refresh or update existing project docs |
| project-improve-doc | `/project-docs:project-improve-doc` | Improve docs structure and quality |
| project-review-docs | `/project-docs:project-review-docs` | Review and validate docs in read-only mode |
| project-revise-docs | `/project-docs:project-revise-docs` | Capture session learnings into canonical docs and AGENTS routing |

## Usage

Run any skill from the list above. Each routes to the appropriate workflow in the `project-docs` skill:

- **create** — first-time setup, establishes canonical taxonomy
- **update** — corrects stale/inaccurate docs without touching source code
- **improve** — structural quality changes (split/merge/slim/consolidate) with user confirmation
- **review** — read-only findings with severity and suggested fixes
- **revise** — capture session learnings into the correct canonical doc or AGENTS routing entry (team-shared; never writes to `CLAUDE.md` or `.claude.local.md`)

## Plugin Structure

```
project-docs/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    ├── project-create-docs/
    │   └── SKILL.md
    ├── project-init-or-update-docs/
    │   └── SKILL.md
    ├── project-improve-doc/
    │   └── SKILL.md
    ├── project-review-docs/
    │   └── SKILL.md
    ├── project-revise-docs/
    │   └── SKILL.md
    └── project-docs/
        ├── SKILL.md
        ├── examples/
        └── references/     (docs-init, docs-update, docs-improve, docs-revise, guidelines, etc.)
```
