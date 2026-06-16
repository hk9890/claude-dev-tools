---
name: tasks
description: "How to use taskmgr — the file-based task tracker: its data model, core commands, and tracking discipline."
when_to_use: "Use when working with a taskmgr / .tasks tracker — creating, finding, updating, or closing tasks via the taskmgr CLI, or deciding what to work on next from its ready queue. Triggers on 'taskmgr', 'task manager', 'the .tasks store', 'create a task / file a bug / open an epic', 'what's ready to work on'. Does not apply to the beads tracker (bd / .beads → use beads-tasks), the harness's built-in TaskCreate/TaskList tools, or TodoWrite."
---

# Using taskmgr

`taskmgr` is a lean, file-based task tracker: issues, dependencies, and ready-work as
Markdown files under a `.tasks/` directory, versioned alongside the code. You operate it
through the `taskmgr` CLI. This skill covers the model and the discipline; for the exact
flag surface, ask the tool itself (see "Source of truth" below).

## 1. Is taskmgr available?

Before using the tracker, confirm both the binary and a store exist:

```bash
ls .tasks/ 2>/dev/null && taskmgr list >/dev/null 2>&1
```

- **No `taskmgr` binary** → stop and tell the user to install it (`make install` from the
  task-manager repo). Do not fall back to TodoWrite or markdown files for tracking.
- **Binary present, no `.tasks/`** → the project has no store yet. Offer to create one with
  `taskmgr init --prefix <p>` (prefix defaults to a slug of the directory name).

The store is found by walking **up** from the current directory, so commands work from any
subdirectory of the project.

## 2. Source of truth for commands

`taskmgr` self-describes — do not guess flags or rely on memory for the exact surface:

```bash
taskmgr commands --json    # machine-readable catalog: every command, flags, examples
```

This catalog is derived from the live command tree and never drifts. Add `--json` to **any**
command for stable `snake_case` output — that is the contract for agents; parse it rather
than scraping the human table. Errors go to stderr prefixed `taskmgr: `; exit `0` = success,
`1` = any error.

## 3. The data model

| Field | Values |
|---|---|
| **type** | `task` (default), `bug`, `feature`, `epic`, `chore` |
| **status** | `open`, `in_progress`, `blocked`, `deferred`, `closed` |
| **priority** | `0` critical, `1` high, `2` normal (default), `3` low, `4` trivial — numeric only |

Three kinds of relationship between issues:

- **parent** — grouping under an epic (one parent per issue).
- **blocked-by** — a hard dependency; the blocked issue is not *ready* until every blocker
  closes. Acyclic and enforced.
- **related** — a non-blocking, **symmetric** link (set on one side, shown from both).

Two derived views fall out of the dependency graph:

- **ready** — `open` with no open blockers: the work you can start right now.
- **blocked** — non-closed with at least one open blocker.

## 4. Core workflow

```bash
# Create — title is the only required field
taskmgr create --title "Fix drill navigation" --type bug --priority 1
taskmgr create --title "Wire up export" --parent proj-0007 --blocked-by proj-0040 --label area:export

# Find work
taskmgr ready                       # what can I start now? (priority, then oldest)
taskmgr show proj-0042              # full detail: fields, edges, description, comments
taskmgr blocked                     # what's waiting, and on what

# Progress an issue
taskmgr update proj-0042 --status in_progress
taskmgr update proj-0042 --add-label needs-review --priority 0
taskmgr close  proj-0042 --reason "fixed in <commit>"

# Edges after the fact
taskmgr dep add proj-0051 proj-0047   # proj-0051 is blocked by proj-0047
taskmgr rel add proj-0042 proj-0012   # symmetric related link

# Notes
taskmgr comment add proj-0042 "Repro only on the cold-start path."
```

`close --reason` records *why*; a bare `update --status closed` closes without a reason —
prefer `close --reason`. Setting a non-closed status on a closed issue reopens it onto that
status.

## 5. Finding work with filters

`list -q` takes a filter expression — `<field> <op> <value>` joined with `&&`, `||`, `!`,
and parentheses. Closed issues are excluded unless the expression selects them or you pass
`--all`.

```bash
taskmgr list -q 'status == "open" && priority <= 1'
taskmgr list -q 'type == bug && label ~ "area:db"'
taskmgr list -q 'ready && priority <= 2'
taskmgr list -q 'text ~ "drill" && !blocked'
taskmgr search "export schema"        # shorthand for text ~ "export schema"
```

Catalog commands — `taskmgr labels`, `taskmgr statuses`, `taskmgr types` — list the valid
values in use when you need them.

## 6. Discipline: the tracker reflects reality

- **Keep it honest.** When scope changes, a decision is made, or direction shifts, update the
  relevant issue immediately — edit the description, create follow-up issues, or close what
  became irrelevant. A stale task misleads everyone who reads it next.
- **Close with a reason** so the history explains itself.
- **Don't reopen finished work to capture new findings** — file a new issue and link it. The
  closed record stays a faithful account of what happened.
