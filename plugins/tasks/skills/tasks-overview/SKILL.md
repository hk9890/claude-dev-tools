---
name: tasks-overview
description: "Where the tracker stands: ready, blocked, in progress."
user-invocable: true
disable-model-invocation: true
argument-hint: "[scope]"
---

# Tracker overview

Load `tasks:tasks-core`.

Report where the tracker stands: what is ready, what is blocked and behind what, what is in
progress. Start from `taskmgr tree`, which nests the open issues under their parents and marks the
ready and the blocked ones; `taskmgr blocked` adds the title and status of each blocker. $ARGUMENTS narrows
it — an issue ID is `taskmgr tree <id>`, any other scope is a filter on `taskmgr list`; with no
argument, everything open.
