# project-explore

Beads-driven assisted exploratory testing for Claude Code.

## Overview

This plugin provides a skill that performs exploratory testing of a project in a structured, beads-tracked way:

1. Research is done inline — the skill reads the project's docs, tickets, and history and writes a compact understanding file capturing what the product does, key workflows, and risk areas.
2. The skill then drives a session of one-action-at-a-time exploration, exercising the product through realistic user flows, and files any finding or question as a beads task.

The plugin is intentionally stateless between runs: each session starts with a fresh research pass and files its own findings so nothing falls through the cracks.

## Skills

| Skill | Invocation | Description |
|---|---|---|
| explore-project | `/project-explore:explore-project` | Research the project inline, then explore it action by action, filing findings and questions as beads tasks |

## Plugin Structure

```
project-explore/
├── .claude-plugin/
│   └── plugin.json
├── RULES.md
└── skills/
    └── explore-project/
        ├── SKILL.md
        └── references/
            ├── understanding-template.md
            └── break-it.md
```
