---
name: tasks-create
description: "Turn this conversation (a review, a plan, a spec) into a filed, dependency-ordered set of tasks, approved before anything is written."
user-invocable: true
disable-model-invocation: true
argument-hint: "[scope]"
allowed-tools: Bash(taskmgr *)
---

# Creating tasks from this conversation

!`taskmgr where`

!`taskmgr guide pkg:task-writing:decomposing`

!`taskmgr guide filing`

!`taskmgr guide pkg:task-writing:types`

`kind: none` above means no store resolved: stop, tell the user, offer `taskmgr init`.

**Scope:** $ARGUMENTS narrows which of this conversation gets filed — "only the critical findings",
"just the auth work". With no scope, everything actionable in it is a candidate.

Collect that material and read what it points at that you have not read — a linked spec, an issue,
a file discussed but never opened. Then decompose it, get the set approved, file it and report,
each to the standard above.
