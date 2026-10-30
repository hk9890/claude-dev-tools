---
name: tasks-groom
description: "Find what has rotted in the open tasks and propose fixes."
user-invocable: true
disable-model-invocation: true
argument-hint: "[scope]"
---

# Groom the tracker

Call the Skill tool with `tasks:tasks-core`, even where it loaded earlier in this session.

Walk the open issues and report what has rotted against the store's standard: bodies that no longer
meet it, duplicates, blocking edges that are not real ordering constraints, and tasks whose context
no longer exists. A doc (type `doc`) is not work, so it stays open when its work is done: groom a
doc only for text a cold reader cannot follow, claims that are no longer true, and text that
changes nothing. Propose a fix for each, and apply them once I approve. $ARGUMENTS narrows the
set — with no argument, everything open.
