# Marketplace Overview

This repo is a collection of Claude Code plugins. Each plugin is independently installable and self-contained.

## Repository layout

```
claude-dev-tools/
├── CLAUDE.md               # Claude Code entrypoint — imports @AGENTS.md
├── AGENTS.md               # Routing table for all AI tools
├── README.md               # Project identity and plugin index
├── docs/
│   ├── OVERVIEW.md         # This file — architecture and contribution guide
│   └── CHANGE-WORKFLOW.md  # Commit and task-tracking conventions
└── plugins/
    ├── beads-tasks/
    ├── complexity-review/
    ├── github-releases/
    └── project-docs/
```

## Plugin layout contract

Each plugin directory follows this structure:

```
<plugin-name>/
├── .claude-plugin/
│   └── plugin.json         # Required: name, description, version, author
├── README.md               # Required: purpose, commands, structure diagram
├── commands/               # Optional: slash command .md files
├── skills/                 # Optional: SKILL.md + references/ subdirectory
└── agents/                 # Optional: subagent .md files
```

### plugin.json required fields

```json
{
  "name": "plugin-name",
  "description": "One-line description",
  "version": "1.0.0",
  "author": { "name": "...", "email": "..." }
}
```

### Command frontmatter

```yaml
---
description: "Verb phrase starting with action word"
argument-hint: "[optional free-text hint]"
allowed-tools: Read, Bash, Edit, Write
---
```

### Skill frontmatter

```yaml
---
name: skill-name
version: 1.0.0
description: "This skill should be used when the user wants to..."
---
```

## Adding a new plugin

1. Create `plugins/<plugin-name>/` with `.claude-plugin/plugin.json` and `README.md`.
2. Add commands under `commands/` and/or skills under `skills/`.
3. Add a row to the plugin table in `AGENTS.md` and `README.md`.
4. Test by enabling the plugin in `.claude/settings.json` and reloading Claude Code.

## Reloading plugins

After adding or modifying a plugin, reload it in Claude Code:

```
/reload-plugins
```

Or restart the Claude Code session to pick up changes automatically.
