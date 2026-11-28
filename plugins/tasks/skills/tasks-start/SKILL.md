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

For a task with the label `kind:park`, follow this in place of the claim above. A park asks for
its session back: its work is the resume command, and its summary is the fallback for when the
session cannot come back. `<park-id>` is the task's id; its Session, Project and Directory lines are
the `<id>`, `<project>` and `<dir>` of the resume.

- `<id>` equals `${CLAUDE_SESSION_ID}`: this session is the parked one and already runs, so close
  the park with that reason.
- The park is already in progress: another agent holds it, so report that and stop.
- Where `revier:revier` is in the available skills, call the Skill tool with `revier:revier`, even
  where it loaded earlier in this session, and follow its "Resume a session" step. Mark the park
  in progress once steps 0 to 4 pass, before the resume.
- The fallback: `revier:revier` is not in the available skills, or its step reports "conversation
  gone" or "directory gone". Claim the park, continue from the summary in this session, and close
  the park with a reason that names this session.
- A failed resume, or any stop after the park went in progress: `taskmgr update <park-id> --status
  open`, and comment the cause, and the address where there is one, on the park.
- The resume holds: close the park with a reason that names the address.
- Any other stop, before the park went in progress, such as a session that runs elsewhere or a
  project with no home window: report it, and leave the park open.
