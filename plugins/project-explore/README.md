# project-explore

Assisted exploratory testing for Claude Code.

## Overview

This plugin provides a skill that performs exploratory testing of a project in a structured, taskmgr-tracked way:

1. Research is done inline — the skill reads the project's docs, tickets, and history and writes a compact understanding file capturing what the product does, key workflows, and risk areas.
2. The skill then drives a session of one-action-at-a-time exploration, exercising the product through realistic user flows, and files any finding or question as a taskmgr task.

The plugin is intentionally stateless between runs: each session starts with a fresh research pass and files its own findings so nothing falls through the cracks.

## Skills

| Skill | Invocation | Description |
|---|---|---|
| project-explore | `/project-explore:project-explore` | Research the project inline, then explore it action by action, filing findings and questions as taskmgr tasks |

## Requirements

The [`taskmgr`](https://github.com/hk9890/task-manager) binary must be installed and a `.tasks/` store initialised (the harness cannot install CLI tools). The skill checks at use time (Phase 0) and stops with guidance if the binary or store is missing — see [RULES.md](RULES.md).

## Plugin Structure

```
project-explore/
├── .claude-plugin/
│   └── plugin.json
├── RULES.md
└── skills/
    └── project-explore/
        ├── SKILL.md
        └── references/
            ├── understanding-template.md
            └── break-it.md
```
