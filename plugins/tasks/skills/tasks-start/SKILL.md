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

A task with the label `kind:park` asks for its session back: its work is the resume command, and
its summary is the fallback for when the session cannot come back. Take its Session, Project and
Directory lines:

- Its Session equals `${CLAUDE_SESSION_ID}`: this session is the parked one and already runs, so
  close the park with that reason.
- Where `revier:revier` is in the available skills, call the Skill tool with `revier:revier`, even
  where it loaded earlier in this session, and follow its "Resume a session" step. Mark the park
  in progress once steps 0 to 4 pass, before the resume.
- The fallback: `revier:revier` is not in the available skills, or its step reports "conversation
  gone" or "directory gone". Claim the park, continue from the summary in this session, and close
  the park with a reason that names this session.
- The session runs elsewhere, or the project has no home window: report it and leave the park
  open.
- A failed resume, from step 6 or step 7: `taskmgr update <id> --status open`, and comment the
  cause and the address on the park.
- The resume holds: close the park with a reason that names the address.
