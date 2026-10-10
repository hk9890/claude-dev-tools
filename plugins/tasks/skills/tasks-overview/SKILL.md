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
progress. Start from `taskmgr tree`, and take the blockers' titles from `taskmgr blocked`.
$ARGUMENTS narrows it: an issue ID is a subtree, any other scope is a filter. With no argument,
everything open.
