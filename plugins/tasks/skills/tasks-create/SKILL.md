---
name: tasks-create
description: "File this conversation as a set of tasks."
user-invocable: true
disable-model-invocation: true
argument-hint: "[scope]"
---

# File this conversation as tasks

Load `tasks:tasks-core`.

Turn this conversation into a set of filed tasks. $ARGUMENTS narrows which of it — with no
argument, everything actionable in it is a candidate.
