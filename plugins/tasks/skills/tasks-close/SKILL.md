---
name: tasks-close
description: "Close a task, against what it said done would look like."
user-invocable: true
disable-model-invocation: true
argument-hint: "[task-id]"
---

# Close a task

Call the Skill tool with `tasks:tasks-core`, even where it loaded earlier in this session.

1. Take the task $ARGUMENTS names. With no argument, the task under discussion; with none, ask.
2. Run `taskmgr guide progress`.
3. Check each done criterion in the task's body against the work. A criterion you cannot check
   yourself, such as a manual sign-off: ask the user to confirm it. A body with no criteria: report
   that and stop.
4. Close the task only when every criterion passes. Where one fails, report it and leave the task
   open.
