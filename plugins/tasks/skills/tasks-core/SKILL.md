---
name: tasks-core
description: "taskmgr: its command surface, and the conventions of the store being written to."
when_to_use: "Use before any work on a taskmgr issue: filing, picking, writing a body, recording progress, closing. Triggers on 'taskmgr', 'the tracker', 'the backlog'."
allowed-tools: Bash(taskmgr *)
---

# taskmgr

!`taskmgr commands tree >/dev/null 2>&1 && taskmgr guide 2>/dev/null || echo "STOP: taskmgr v0.11.0 or later is not on PATH, so the guide did not print. Read references/troubleshooting.md in this skill's directory and follow it."`

## Status before implementation

Before the first edit that implements an issue, run `taskmgr update <id> --status in_progress`: the status tells the user and every other session that the issue is taken. A session that hands the implementation to a subagent or a workflow sets the status itself, before the hand-off.
