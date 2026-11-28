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
Directory lines, and claim it only where the resume can go ahead:

- Its Session equals `${CLAUDE_SESSION_ID}`: this session is the parked one and already runs, so
  close the park with that reason.
- `revier:revier` is not in the available skills: claim it and continue from the summary.
- Otherwise call the Skill tool with `revier:revier`, even where it loaded earlier in this session,
  and follow its "Resume a session" step. Mark the park in progress once steps 0 to 4 pass, before
  the resume. Then:
  - "conversation gone" or "directory gone": claim it, continue from the summary in this session,
    and close the park with a reason that names this session.
  - The session runs elsewhere, or the project has no home window: report it and leave the park
    open.
  - A failed resume: `taskmgr update <id> --status open`, and comment the cause on the park.
  - `.session` equals the Session id: close the park with a reason that names the address.
