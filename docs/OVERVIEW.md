# Marketplace Overview

This repo is a collection of Claude Code plugins. Each plugin lives under `plugins/<plugin-name>/` and is independently installable.

## Repo layout

```
claude-dev-tools/
  .claude/               # repo-committed Claude Code settings shared by contributors
  .tasks/                # taskmgr task store (local-only — gitignored, absent from a fresh clone)
  .claude-plugin/        # repo-level marketplace manifest
    marketplace.json     # lists all plugins, their versions, and descriptions
  .github/               # CI workflows and Dependabot config — see TESTING.md for the jobs
  docs/                  # developer topic guides — see AGENTS.md for task->doc routing
  plugins/               # one subdirectory per plugin
  prototypes/            # non-shipped HTML reference prototypes — not served or loaded by any plugin
  scripts/               # repo maintenance scripts
  tests/                 # structural validation and smoke tests
```

For the full list of plugins, see the [plugin table in README.md](../README.md#plugins).

## Plugin directory layout

```
plugins/<plugin-name>/
  .claude-plugin/
    plugin.json          # per-plugin manifest: name, version, description, author
  agents/                # subagents (.md files)
  assets/                # static files served or bundled by the plugin (e.g. browser CSS/JS)
  bin/                   # executable scripts bundled with the plugin
  commands/              # slash commands (.md files; currently no plugin uses these)
  hooks/                 # Claude Code hook definitions (e.g. hooks.json)
  scripts/               # build-time scripts, e.g. a generator for themes/ (not loaded at runtime)
  skills/                # skills (<skill-name>/SKILL.md + optional references/, scripts/, examples/, workflows/)
  themes/                # color theme files
  workflows/             # Workflow-tool orchestration scripts (.js) — at plugin root, or inside the one skill that owns them
```

## Finding things

```bash
ls plugins/*/skills/*/SKILL.md                                 # every skill in the marketplace
git grep -ln 'name: <skill>' -- 'plugins/*/skills/*/SKILL.md'  # which plugin ships a skill
git grep -n '<plugin>:<skill>' -- plugins                      # where a skill is referenced by its qualified name
ls -d plugins/*/hooks                                          # which plugins define hooks
ls plugins/*/agents/*.md plugins/*/workflows/*.js plugins/*/skills/*/workflows/*.js   # agents, and workflows in both layouts
```

## External references

- [Claude Code plugin docs](https://code.claude.com/docs/en/plugins) — the plugin and marketplace format this repo targets.


