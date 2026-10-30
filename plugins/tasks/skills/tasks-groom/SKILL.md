---
name: tasks-groom
description: "Find what has rotted in the open issues and propose fixes."
user-invocable: true
disable-model-invocation: true
argument-hint: "[scope]"
---

# Groom the tracker

Call the Skill tool with `tasks:tasks-core`, even where it loaded earlier in this session.

Walk the open issues and report what has rotted against the store's standard: bodies that no longer
meet it, duplicates, blocking edges that are not real ordering constraints, and issues whose context
no longer exists. A doc (type `doc`) gets every check, with one body check in place of the store's
standard: text a cold reader cannot follow, claims that are no longer true, and text that changes
nothing. A doc stays open when the work it describes is done. Propose a fix for each, and apply them
once I approve. $ARGUMENTS narrows the set — with no argument, everything open.
