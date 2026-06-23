# tasks

A thin literacy skill for the [`taskmgr`](https://github.com/hk9890/task-manager) file-based
task tracker.

## Overview

`taskmgr` stores issues, dependencies, and ready-work as Markdown files under a `.tasks/`
directory, versioned alongside the code. This plugin teaches Claude **how to use it** — the
data model, the core commands, and the discipline of keeping a tracker honest — and defers the
exact flag surface to `taskmgr commands`, which the CLI emits from its own live command tree.

It is deliberately **not** a workflow methodology: no planning/execution orchestration, no
tasker/reviewer/verifier agents, no gates. That is the difference from `beads-tasks`. The skill
is model-discoverable, so Claude pulls it in when it is about to operate a `.tasks` store.

## Skills

| Skill | Invocation | Description |
|---|---|---|
| tasks | model-discoverable (`tasks:tasks`) | How to use taskmgr — data model, core commands, and tracking discipline |

## Requirements

The `taskmgr` binary must be installed (the harness cannot install CLI tools). The skill checks
at use time and stops with guidance if the binary or a `.tasks/` store is missing — see
[RULES.md](RULES.md).

## Plugin Structure

```
tasks/
├── .claude-plugin/
│   └── plugin.json
├── RULES.md
└── skills/
    └── tasks/
        └── SKILL.md
```
