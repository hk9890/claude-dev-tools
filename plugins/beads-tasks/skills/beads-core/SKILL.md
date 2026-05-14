---
name: beads-tasks
description: "This skill should be used when the user wants to plan work in beads, structure or file issues/bugs/tasks in the tracker, run the execution queue, review or close an epic, run an acceptance review, check tracker health, or troubleshoot the beads setup. Also applies when the user says things like 'plan this out in beads', 'file a bug for this', 'what tasks are ready to execute', 'close the epic', 'run the acceptance review', or 'create a task for this'. Does not apply to GitHub Issues/Jira sync, docs lifecycle work, GitHub releases, or general coding tasks unrelated to beads."
user-invocable: false
---

Routing reference for beads workflows. Load the relevant document for the task at hand.

## Workflow routing

| Need | Source of truth |
|---|---|
| Build an epic + tasks plan | [references/planning.md](references/planning.md) |
| Structure issues, labels, dependencies | [references/beads-issue-workflow.md](references/beads-issue-workflow.md) |
| Run execution orchestration (ready queue, parallelization) | [references/execution-orchestration.md](references/execution-orchestration.md) |
| Run acceptance-review and close criteria | [references/beads-acceptance-review.md](references/beads-acceptance-review.md) |
| Tracker comment format, bug draft fields, ticket readiness | [references/ticket-rules.md](references/ticket-rules.md) |

## Additional routing

- For docs lifecycle or AGENTS authoring work, use the `project-docs` plugin if installed.
