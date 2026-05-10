# project-docs

Project documentation lifecycle management for Claude Code.

## Overview

This plugin provides structured workflows for creating, updating, improving, and reviewing project documentation. It establishes canonical doc taxonomy and keeps AGENTS.md routing aligned with the repository.

## Commands

| Command | Description |
|---|---|
| `/create-docs` | Create or initialize project docs baseline from scratch |
| `/init-or-update-docs` | Refresh or update existing project docs |
| `/improve-doc` | Improve docs structure and quality |
| `/review-docs` | Review and validate docs in read-only mode |

## Usage

Run any command from the list above. Each routes to the appropriate workflow in the `coder-docs` skill:

- **create** — first-time setup, establishes canonical taxonomy
- **update** — corrects stale/inaccurate docs without touching source code
- **improve** — structural quality changes (split/merge/slim/consolidate) with user confirmation
- **review** — read-only findings with severity and suggested fixes

## Plugin Structure

```
project-docs/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   ├── create-docs.md
│   ├── init-or-update-docs.md
│   ├── improve-doc.md
│   └── review-docs.md
└── skills/
    └── coder-docs/
        ├── SKILL.md
        └── references/     (docs-init, docs-update, docs-improve, guidelines, etc.)
```
