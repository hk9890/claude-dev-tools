# Beads Execution Orchestration

Run planned work safely using the ready queue, dependency graph, and explicit verification gates.

In this repo, subagents may read tracker state, but the orchestrator owns all tracker mutations. Apply `bd create`, `bd update`, `bd close`, `bd comments add`, and `bd dep add` serially per workspace.

## Execution loop

1. Check actionable work: `bd ready`.
2. Pick independent tasks for parallel execution.
3. Move selected tasks to `in_progress` serially from the orchestrator.
4. Execute task instructions exactly.
5. Run required tests/checks for the task scope.
6. Record comments, follow-up bugs, and closures serially from the orchestrator.
7. Re-check `bd ready` and repeat.

## Parallelization rule

Parallelize only when tasks do **not** share mutable files or hidden sequencing constraints.

Parallelize implementation and verification work, not tracker writes. Do not treat lock failure as a correctness signal.

Use dependencies instead of assumptions.

## Pre-execution ticket review (mandatory)

Before implementing a task:

1. `bd show <id>` and read full description/instructions/comments.
2. If labels include `needs:discussion` or `has:open-questions`, stop execution.
3. If comments contain scope decisions not reflected in the issue body, treat as stale and stop.
4. If acceptance criteria are ambiguous or not testable, stop and comment.

When blocked by quality gaps:

```bash
bd comments add <id> "Cannot execute: <specific gaps>"
```

If a subagent found the blocker, have it return tracker-ready comment text and apply that comment from the orchestrator.

## Handling failures

- **Task-related failure**: fix within task scope, rerun checks.
- **Unrelated failure**: create follow-up bug from the orchestrator and continue if possible.

```bash
bd create --title="Found: <description>" --type=bug --priority=2 --description="Discovered while working on <task-id>. <details>"
```

## Orchestration checkpoints

At each iteration capture:

- `bd ready` (what can run now)
- `bd blocked` (what needs dependencies/discussion)
- `bd status` (overall progress)

## Closure order

1. close implementation tasks serially from the orchestrator
2. run acceptance-review task
3. close epic only when acceptance-review gate is closed

See [beads-acceptance-review.md](beads-acceptance-review.md).
