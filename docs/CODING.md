# Coding Guide

Implementation guide for contributing to this plugin marketplace.

## Adding a new plugin

1. Create `plugins/<plugin-name>/` with the standard layout (see [OVERVIEW.md](OVERVIEW.md) for the directory tree).
2. Write `.claude-plugin/plugin.json` — required fields: `name`, `version`, `description`.
3. Create `docs/rules/<plugin-name>.md` for plugin-specific rules and design decisions.
4. Add the plugin to the table in `README.md`.
5. Use the `plugin-dev` skill set to scaffold components: commands, skills, agents, hooks, MCP integration.

## Plugin rules files

Rules files live at `docs/rules/<plugin-name>.md`. They record facts, constraints, and design decisions that are not derivable from the code — deliberate feature exclusions, chosen approaches, known tradeoffs.

**Before making decisions or changes for a plugin, read its rules file.** Rules override general best-practice suggestions.

Rules files follow the pattern `docs/rules/<plugin-name>.md`. Not every plugin has one — only create a file when there is a real decision or constraint to record.
