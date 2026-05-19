# Coding Guide

Implementation guide for contributing to this plugin marketplace.

## Adding a new plugin

1. Create `plugins/<plugin-name>/` with the standard layout (see [OVERVIEW.md](OVERVIEW.md) for the directory tree).
2. Write `.claude-plugin/plugin.json` — required fields: `name`, `version`, `description`, `author`.
3. Register the plugin in `.claude-plugin/marketplace.json` under the `plugins` array with fields: `name`, `source`, `description`, `version`, `author`, `category`, `keywords`.
4. If your plugin has non-obvious conventions not captured in code, create `plugins/<plugin-name>/RULES.md` for plugin-specific rules and design decisions.
5. Add the plugin to the table in `README.md`.
6. Use the `plugin-dev` skill set to scaffold components: commands, skills, agents, hooks, MCP integration.

## Plugin rules files

Rules files live at `plugins/<plugin-name>/RULES.md`. They record facts, constraints, and design decisions that are not derivable from the code — deliberate feature exclusions, chosen approaches, known tradeoffs.

**Before making decisions or changes for a plugin, read its rules file.** Rules override general best-practice suggestions.

Rules files follow the pattern `plugins/<plugin-name>/RULES.md`. Not every plugin has one — only create a file when there is a real decision or constraint to record.

Check `plugins/*/RULES.md` files for plugin-specific design rules.
