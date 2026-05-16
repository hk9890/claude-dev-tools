---
name: beads-core
description: "Shared reference library for beads workflows — loaded by beads-plan, beads-work, and beads agents; not invoked directly"
user-invocable: false
---

## How to use

This skill is a routing table. Load the reference doc whose "When you need to" phrase matches what you are about to do; the actual workflow content lives in the references.

## Workflow routing

| When you need to | Load |
|---|---|
| Decide whether to discuss intent with the user or propose a plan — **planning intake** | [references/planning-intake.md](references/planning-intake.md) |
| Decide what to work on (conversation refs first, tracker discovery second) — **work intake** | [references/work-intake.md](references/work-intake.md) |
| Create epics, tasks, and the acceptance-review task after intent is confirmed — **planning workflow** | [references/planning.md](references/planning.md) |
| Run the execution loop — plan-review gate, tasker/verifier delegation, parallel rules, closure — **execution orchestration** | [references/execution-orchestration.md](references/execution-orchestration.md) |
| Structure beads issues — labels, dependencies, blocked discussion tasks — **issue workflow** | [references/beads-issue-workflow.md](references/beads-issue-workflow.md) |
| Run acceptance review and apply close criteria — **acceptance review** | [references/beads-acceptance-review.md](references/beads-acceptance-review.md) |
| Format tracker comments, draft bugs, check ticket readiness — **subagent conventions** | [references/ticket-rules.md](references/ticket-rules.md) |
| Apply shared operational rules — serialized writes, agent delegation, git safety — **core rules** | [references/core-rules.md](references/core-rules.md) |
