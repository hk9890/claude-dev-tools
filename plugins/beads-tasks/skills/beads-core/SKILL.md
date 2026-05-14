---
name: beads-core
description: "Shared reference library for beads workflows — loaded by beads-plan, beads-work, and beads agents; not invoked directly"
user-invocable: false
---

Routing reference for beads workflows. Load the relevant document for the task at hand.

## Workflow routing

| Need | Source of truth |
|---|---|
| Shared operational rules, git safety, agent delegation | [references/core-rules.md](references/core-rules.md) |
| Build an epic + tasks plan | [references/planning.md](references/planning.md) |
| Structure issues, labels, dependencies | [references/beads-issue-workflow.md](references/beads-issue-workflow.md) |
| Run execution orchestration (ready queue, parallelization) | [references/execution-orchestration.md](references/execution-orchestration.md) |
| Run acceptance-review and close criteria | [references/beads-acceptance-review.md](references/beads-acceptance-review.md) |
| Tracker comment format, bug draft fields, ticket readiness | [references/ticket-rules.md](references/ticket-rules.md) |
| Planning intake decision logic | [references/planning-intake.md](references/planning-intake.md) |

## Additional routing

- For docs lifecycle or AGENTS authoring work, use the `project-docs` plugin if installed.
