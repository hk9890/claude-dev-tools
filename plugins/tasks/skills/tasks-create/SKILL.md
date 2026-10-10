---
name: tasks-create
description: "File this conversation as a set of tasks."
user-invocable: true
disable-model-invocation: true
argument-hint: "[scope]"
---

# File this conversation as tasks

Load `tasks:tasks-core`.

Turn this conversation into a set of filed tasks. File the set in one call, so that a refused
entry files none of them, and on standard input, so that no file stays behind:
`taskmgr create --from -`. $ARGUMENTS narrows which part of the conversation — with no argument,
everything actionable in it is a candidate.
