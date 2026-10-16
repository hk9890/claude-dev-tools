---
name: tasks-start
description: "Claim a task and brief me on what it asks for."
user-invocable: true
disable-model-invocation: true
argument-hint: "[task-id]"
---

# Start a task

Call the Skill tool with `tasks:tasks-core`, even where it loaded earlier in this session.

Claim $ARGUMENTS, mark it in progress, and brief me on what it asks for. With no argument, propose
one from the ready queue and claim it once I agree.
