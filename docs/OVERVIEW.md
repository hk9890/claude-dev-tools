# Marketplace Overview

This repo is a collection of Claude Code plugins. Each plugin lives under `plugins/<plugin-name>/` and is independently installable.

## Plugin directory layout

```
plugins/<plugin-name>/
  .claude-plugin/
    plugin.json          # manifest: name, version, description, author
  README.md              # user-facing plugin docs
  commands/              # slash commands (.md files)
  skills/                # skills (<skill-name>/SKILL.md + references/)
  agents/                # subagents (.md files)
```

Not all component types are required — a plugin may have only commands, only skills, or a mix.

## Adding a new plugin

1. Create `plugins/<plugin-name>/` with the layout above.
2. Write `.claude-plugin/plugin.json` (required fields: `name`, `version`, `description`).
3. Add plugin to the table in `README.md`.
4. Use the `plugin-dev` skill set for scaffolding components: commands, skills, agents, hooks, and MCP integration.

