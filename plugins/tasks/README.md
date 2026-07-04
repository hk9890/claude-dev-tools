# tasks

Drive the [`taskmgr`](https://github.com/hk9890/task-manager) file-based task tracker: a literacy
skill for the CLI, a skill that turns findings into well-formed tasks, and generic worker agents that
implement and verify a single task.

## Overview

`taskmgr` stores issues, dependencies, and ready-work as Markdown files under a `.tasks/` directory,
versioned alongside the code. This plugin provides:

- **`tasks`** — the literacy skill: the data model, the core commands, the discipline of keeping a
  tracker honest, and the taskmgr-specific gotchas every automating agent must know (closure is not
  gated, concurrent writes are safe, `--description-file -`). It defers the exact flag surface to
  `taskmgr commands`, which the CLI emits from its own live command tree.
- **`tasks-create`** — turns findings already present in the conversation (a review, `/code-review`,
  `/simplify`, an exploration) into well-formed `bug`/`chore`/`task` issues using one standard body
  template. It is the single source of truth for how a finding becomes a task.
- **`implementer`** and **`verifier`** agents — generic, single-purpose workers. The implementer
  implements one assigned task and reports; the verifier checks one outcome against its acceptance
  criteria, closes a passing task, and never closes an epic. Both write the tracker directly (taskmgr
  serializes writes via its lock) and file a bug for any defect they find.
- **`tasks-work`** — the execution entry point. It confirms scope, then runs the bundled `work.js`
  workflow: one `implementer` per task, a verify stage (review ∥ test), and a record stage that closes
  passing tasks. Epics are verified and left for a human to close.

It deliberately keeps the methodology thin: no planning/work-intake documents, no serialized-writes
orchestrator protocol, no acceptance-review *task* pattern — the ready→implement→verify→record loop
is a thin, deterministic workflow, not a methodology. See [RULES.md](RULES.md) for the design
decisions behind that.

## Skills

| Skill | Invocation | Description |
|---|---|---|
| `tasks` | model-discoverable (`tasks:tasks`) | How to use taskmgr — data model, core commands, tracking discipline, and CLI gotchas |
| `tasks-create` | user-invocable (`/tasks-create`) | Turn conversation findings into well-formed bug/chore/task issues with a standard body |
| `tasks-work` | user-invocable (`/tasks-work`) | Confirm scope, then run ready work through implement → verify → record via the bundled `work.js` workflow |

## Agents

| Agent | Description |
|---|---|
| `implementer` | Implements one assigned task and reports the outcome; refuses an unready ticket; files bugs for unrelated defects |
| `verifier` | Verifies one task or an epic outcome against acceptance criteria; closes a passing task; never closes an epic |

## Requirements

The `taskmgr` binary must be installed (the harness cannot install CLI tools). The skills check at
use time and stop with guidance if the binary or a `.tasks/` store is missing — see [RULES.md](RULES.md).

## Plugin structure

```
tasks/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── RULES.md
├── agents/
│   ├── implementer.md
│   └── verifier.md
├── skills/
│   ├── tasks/
│   │   └── SKILL.md
│   ├── tasks-create/
│   │   └── SKILL.md
│   └── tasks-work/
│       └── SKILL.md
└── workflows/
    └── work.js            (bundled execution workflow, run by tasks-work via scriptPath)
```
