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

For implementation steps (adding a plugin, rules files, scaffolding) see [CODING.md](CODING.md).

