---
name: beads-plan
description: "Create beads issues for the current conversation — determines what to plan, asks questions if context is missing, then creates epics, tasks, and acceptance-review tasks."
user-invocable: true
disable-model-invocation: true
---

## Step 1 — Intake

Load and follow `beads-core/references/planning-intake.md`.

Either proceed (context is sufficient) or ask focused questions until it is. Do not proceed to Step 2 until there is enough context to write a ticket.

## Step 2 — Plan

Follow the **Planning Workflow** section of `beads-core/references/planning.md` to create the epics, tasks, and acceptance-review task.

Load `beads-core/references/beads-issue-workflow.md` for label and dependency rules.

## Step 3 — Rules

For shared operational rules (serialized writes, agent delegation, git safety), see `beads-core/references/core-rules.md`.
