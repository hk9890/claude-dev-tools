---
name: beads-work
description: "This skill should be used when the user wants to execute beads tasks, run the ready queue, continue work on an existing plan, or work through in-progress issues. Applies when the user says things like 'run the queue', 'execute the tasks', 'continue the work', 'what's next in beads', 'pick up the next task', or 'work on the tasks'. Does not apply to creating new epics or planning from scratch — use beads-plan for that."
user-invocable: true
disable-model-invocation: true
---

Load `beads-core` for tracker workflow reference, then run the execution loop.

## Execution Loop

1. Run `bd ready` to see unblocked work
2. Move selected tasks to `in_progress`: `bd update <id> --status=in_progress`
3. Spawn taskers for ready tasks — in parallel when independent (single message, multiple tool calls)
4. After taskers return, apply all proposed tracker updates serially: comments, status changes, new bugs, dependency updates, closures
5. Run `bd ready` again for newly unblocked work — repeat until done or blocked
6. When implementation tasks are done, spawn verifier for acceptance review tasks
7. Close epic when all tasks pass acceptance

## Tracker Mutation Rules

- **Only the orchestrator writes to beads** — taskers and verifiers are read-only on the tracker
- **Serialize all writes** — one `bd` command at a time per workspace
- Collect proposed tracker changes from subagents and apply them yourself after they return

## Finding Work

```bash
bd ready                        # Unblocked work ready to start
bd list --status=in_progress    # Currently active work
bd blocked                      # What's stuck and why
bd show <id>                    # Full details for a specific task
```

## When Blocked

If `bd ready` is empty and work remains open, run `bd blocked` to see what's stuck. Report what is blocking and what tracker updates are needed to unblock.

For full planning and orchestration rules (decision framework, agent delegation, git safety), see the `beads-plan` skill.
