---
name: beads-work
description: "Run the beads execution loop — pick up in-progress or ready tasks and drive them to completion."
user-invocable: true
disable-model-invocation: true
---

## Step 1 — Triage in_progress tasks

Run `bd list --status=in_progress`.

For each task returned, run `bd show <id>` and check:
- Last-updated time
- Latest comment for blocker indicators

If a task was last updated **more than 24 hours ago** OR has a comment indicating a blocker:
surface it to the user and ask whether to **resume**, **skip**, or **mark blocked** — do NOT auto-resume.

Only proceed automatically with in_progress tasks clearly started in the current session.

If healthy in_progress tasks exist: continue those before starting new work.
If none: go to Step 2.

## Step 2 — Pick from ready queue

Run `bd ready` to find unblocked work.

For each task selected:
1. Move to in_progress before spawning a tasker: `bd update <id> --status=in_progress`
2. For independent tasks: spawn taskers in parallel (single message, multiple tool calls)
3. For acceptance review tasks: spawn a **verifier**, not a tasker

After each batch:
- Apply all proposed tracker updates serially (comments, status changes, bugs, closures)
- Re-check `bd ready` for newly unblocked work — repeat until done or blocked

Follow `beads-core/references/execution-orchestration.md` for the full loop.

## Step 3 — Closure

After all implementation tasks close and acceptance review passes: close the epic.

See `beads-core/references/execution-orchestration.md` for closure order.

## Operational rules

Load `beads-core/references/core-rules.md` for serialized writes, agent delegation, and git safety rules.
