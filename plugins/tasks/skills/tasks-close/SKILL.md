---
name: tasks-close
description: "Close a task, against what it said done would look like."
user-invocable: true
disable-model-invocation: true
argument-hint: "[task-id]"
---

# Close a task

Call the Skill tool with `tasks:tasks-core`, even where it loaded earlier in this session.

Close $ARGUMENTS once each done criterion in its body is checked against the work: run
`taskmgr guide progress` first. Where a criterion fails or cannot be run, report it and leave the
task open. With no argument, the task under discussion.
