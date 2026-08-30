---
name: tasks-groom
description: "Find what has rotted in the open tasks and propose fixes."
user-invocable: true
disable-model-invocation: true
argument-hint: "[scope]"
---

# Groom the tracker

Load `tasks:tasks-core`.

Walk the open tasks and report what has rotted against the store's standard: bodies that no longer
meet it, duplicates, blocking edges that are not real ordering constraints, and tasks whose context
no longer exists. Propose a fix for each, and apply them once I approve. $ARGUMENTS narrows the
set — with no argument, everything open.
