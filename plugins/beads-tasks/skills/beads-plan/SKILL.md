---
name: beads-plan
description: "Create beads issues for the current conversation — understands intent first, discusses with the user if unclear, proposes a plan, and only creates epics/tasks after the user confirms."
user-invocable: true
disable-model-invocation: true
---

## Workflow

1. Load `beads-tasks:beads-core` for the routing table.
2. Load and follow the **planning intake** instructions to scan the conversation and either discuss with the user (if intent is unclear) or propose a plan (if intent is clear). Do not write to the tracker during intake.
3. On explicit user confirmation of the proposed plan, load and follow the **planning workflow** instructions to create the epic, tasks, and acceptance-review task. For label and dependency rules, load the **issue workflow** instructions.

Throughout, apply the **core rules** — serialized writes, agent delegation, git safety.
