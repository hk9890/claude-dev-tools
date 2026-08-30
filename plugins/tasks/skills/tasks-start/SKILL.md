---
name: tasks-start
description: "Claim a task and brief me on what it asks for."
user-invocable: true
disable-model-invocation: true
argument-hint: "[task-id]"
---

# Start a task

Load `tasks:tasks-core`.

Claim $ARGUMENTS, mark it in progress, and brief me on what it asks for. With no argument, propose
one from the ready queue and claim it once I agree.
