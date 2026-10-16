---
name: tasks-handover
description: "Record this session's state in the tracker as a handover."
user-invocable: true
disable-model-invocation: true
argument-hint: "[what-to-cover]"
---

# Hand this session over

Call the Skill tool with `tasks:tasks-core`, even where it loaded earlier in this session.

Record this session's state in the tracker as a handover document: what was done, what is in
flight, and what whoever picks it up next needs to know. $ARGUMENTS names what to cover — with no
argument, the whole session.
