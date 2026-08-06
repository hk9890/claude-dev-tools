# Marketplace Overview

A collection of Claude Code plugins. Each plugin lives under `plugins/<plugin-name>/` and is independently installable; the [plugin table in README.md](../README.md#plugins) lists them all.

## Repo layout

```
claude-dev-tools/
  .claude/               # repo-committed Claude Code settings
  .claude-plugin/
    marketplace.json     # repo-level manifest: every plugin, its version and description
  .github/               # CI workflows and Dependabot config
  .tasks/                # taskmgr store (gitignored — absent from a fresh clone)
  docs/                  # developer topic guides
  plugins/               # one subdirectory per plugin
  scripts/               # repo maintenance scripts
  tests/                 # structural validation and smoke tests
```

## Plugin directory layout

```
plugins/<plugin-name>/
  .claude-plugin/
    plugin.json          # per-plugin manifest: name, version, description, author
  agents/                # subagents (.md)
  assets/                # static files the plugin serves or bundles (e.g. browser CSS/JS)
  bin/                   # bundled executables
  commands/              # slash commands (.md; no plugin uses these yet)
  hooks/                 # hooks.json
  references/            # .md shared by two or more of the plugin's skills, reached with ../..
  scripts/               # build-time scripts, e.g. a themes/ generator (not loaded at runtime)
  skills/                # <skill-name>/SKILL.md + optional references/, scripts/, examples/, workflows/
  themes/                # color themes
  workflows/             # Workflow-tool scripts (.js) — here, or inside the one skill that owns them
```

## Finding things

```bash
ls plugins/*/skills/*/SKILL.md                                 # every skill in the marketplace
git grep -ln 'name: <skill>' -- 'plugins/*/skills/*/SKILL.md'  # which plugin ships a skill
git grep -n '<plugin>:<skill>' -- plugins                      # references by qualified name
ls -d plugins/*/hooks                                          # which plugins define hooks
git ls-files 'plugins/*/agents/*.md' 'plugins/*/workflows/*.js' 'plugins/*/skills/*/workflows/*.js'
```

## External references

- [Claude Code plugin docs](https://code.claude.com/docs/en/plugins) — the plugin and marketplace format this repo targets.
