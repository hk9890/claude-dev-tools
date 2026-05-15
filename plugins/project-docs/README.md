# project-docs

Project documentation lifecycle management for Claude Code.

## Overview

This plugin provides structured workflows for creating, updating, improving, and reviewing project documentation. It establishes canonical doc taxonomy and keeps AGENTS.md routing aligned with the repository.

## Skills

| Skill | Invocation | Description |
|---|---|---|
| create-docs | `/project-docs:create-docs` | Create or initialize project docs baseline from scratch |
| init-or-update-docs | `/project-docs:init-or-update-docs` | Refresh or update existing project docs |
| improve-doc | `/project-docs:improve-doc` | Improve docs structure and quality |
| review-docs | `/project-docs:review-docs` | Review and validate docs in read-only mode |

## Usage

Run any skill from the list above. Each routes to the appropriate workflow in the `project-docs` skill:

- **create** — first-time setup, establishes canonical taxonomy
- **update** — corrects stale/inaccurate docs without touching source code
- **improve** — structural quality changes (split/merge/slim/consolidate) with user confirmation
- **review** — read-only findings with severity and suggested fixes

## Plugin Structure

```
project-docs/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    ├── create-docs/
    │   └── SKILL.md
    ├── init-or-update-docs/
    │   └── SKILL.md
    ├── improve-doc/
    │   └── SKILL.md
    ├── review-docs/
    │   └── SKILL.md
    └── project-docs/
        ├── SKILL.md
        ├── examples/
        └── references/     (docs-init, docs-update, docs-improve, guidelines, etc.)
```
