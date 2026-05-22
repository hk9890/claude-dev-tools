# Marketplace Overview

This repo is a collection of Claude Code plugins. Each plugin lives under `plugins/<plugin-name>/` and is independently installable.

## Repo layout

```
claude-dev-tools/
  .beads/                # beads task database for this repo (the bd issue store)
  .claude-plugin/        # repo-level marketplace manifest
    marketplace.json     # lists all plugins, their versions, and descriptions
  docs/                  # developer guides (OVERVIEW, CODING, TESTING, RELEASING, …)
  plugins/               # one subdirectory per plugin
  scripts/               # repo maintenance scripts
  tests/                 # structural validation and smoke tests
```

`.claude-plugin/marketplace.json` is the **repo-level manifest** — it lists every plugin in the marketplace with its name, version, description, and source path. It is distinct from the per-plugin `.claude-plugin/plugin.json`, which carries only that plugin's own metadata.

All plugins are released together under a single repo-level version tag. Every `plugin.json` and the matching entry in `marketplace.json` are bumped to the same version in each release. See [RELEASING.md](RELEASING.md) for details.

For the full list of plugins, see the [plugin table in README.md](../README.md#plugins).

## Plugin directory layout

```
plugins/<plugin-name>/
  .claude-plugin/
    plugin.json          # per-plugin manifest: name, version, description, author
  README.md              # user-facing plugin docs
  agents/                # subagents (.md files)
  bin/                   # executable scripts bundled with the plugin
  commands/              # slash commands (.md files)
  hooks/                 # Claude Code hook definitions (e.g. hooks.json)
  skills/                # skills (<skill-name>/SKILL.md + references/)
  themes/                # color theme files
```

Not all component types are required — a plugin may have only commands, only skills, or a mix.

For implementation steps (adding a plugin, rules files, scaffolding) see [CODING.md](CODING.md).

