---
name: tasks-create
description: "Turn this conversation (a review, a plan, a spec) into a filed, dependency-ordered set of tasks, approved before anything is written."
user-invocable: true
disable-model-invocation: true
argument-hint: "[scope]"
allowed-tools: Bash(taskmgr *)
---

# Creating tasks from this conversation

**Scope:** $ARGUMENTS narrows what gets filed — "only the critical findings", "just the auth work".
With no scope, everything actionable in the conversation is a candidate and step 3 confirms the set.

## The tracker on this machine

!`taskmgr where`

`kind: none` means no store resolved: stop, tell the user, offer `taskmgr init`.

## 1. Gather and ground

Collect the actionable material, then read what it points at that you have not read — a linked
spec, an issue, a file discussed but never opened.

Then open the code each task will touch and take the real path, the real symbol, the real command
from it. A task written from the code starts the implementer in the right file; one written from
the discussion starts them searching.

## 2. Decompose

**Findings** — a review, a `/simplify` pass, a failing build. One task per finding. Several
instances of the same fix are one task. A finding that is both a defect and untidiness around it
splits by type.

**A plan or spec** — cut it into **tracer bullets**: each task a narrow but complete path through
every layer it touches, so finishing it produces something demonstrable. Size each to one sitting.
A horizontal slice ("all the schema changes") can be finished with nothing working end to end, so
the first evidence anything is right arrives only after the last task closes.

Then the edges. **Blocked-by** is a real ordering constraint: B cannot start until A closes.
Wanting A first is priority, and a false edge makes the ready queue lie about what is available.
**Parent** groups children under an epic that share one outcome, and blocks nothing.

## 3. Get the set approved

Present the whole set as a numbered list, id-less:

```
1. [epic]      Orders export
2. [bug/1]     Expired access token is accepted on every endpoint
3. [feature/2] Export the orders table as CSV     parent: 1   blocked by: 2
4. [chore/3]   Collapse the three date formatters
```

Ask about granularity, the edges, and anything to merge, split, or drop. Iterate until the user
approves. A filed set is harder to reshape than a list in a message, so file nothing before that.

## 4. File to the store's standard

```bash
taskmgr guide filing
taskmgr guide pkg:task-writing:types
```

Write every body until every rule those printed clears, then create the set.

## 5. Report

Id, type, priority, title, and the edges between them, so the user can see the shape and run
`taskmgr ready`. Name anything you left unfiled and why.
