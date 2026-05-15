# Beads Core Rules

Shared operational rules for all beads workflows. These apply to the planning orchestrator (beads-plan), the execution orchestrator (beads-work), and the spawned taskers, reviewers, and verifiers alike.

## Beads is the tracker

Do NOT use TodoWrite, TaskCreate, or markdown files for task tracking when beads is active. Use `bd create`, `bd ready`, `bd close` for all task tracking.

## Serialized writes rule

All beads writes belong to the orchestrator alone. Subagents may read tracker state with `bd show`, but they MUST NOT run `bd create`, `bd update`, `bd close`, `bd comments add`, or `bd dep add`. Collect proposed tracker changes from subagents and apply them yourself, one write at a time, per workspace.

## Issue-before-execution rule

Ensure a beads issue exists before spawning a tasker. Create it or confirm it exists first — never execute against work that has no tracker record.

## Priority is numeric (0–4)

Use numeric priorities P0–P4. Do NOT use "high", "medium", or "low". Map as: P0 = critical, P1 = high, P2 = normal, P3 = low, P4 = trivial.

## Beads must reflect reality (NON-NEGOTIABLE)

Every decision, scope change, new insight, or shifted direction MUST be immediately reflected in the relevant tasks, bugs, and epics. If a discussion changes the approach, UPDATE the task description. If scope grows, CREATE new tasks. If a task becomes irrelevant, CLOSE it. Stale tickets are lies — they mislead every agent that reads them. There is NO acceptable reason for a beads issue to be out of date.

## Agent delegation table

| Agent        | When to Spawn                                         | What They Do                                                            |
|--------------|-------------------------------------------------------|-------------------------------------------------------------------------|
| **tasker**   | Structured tasks from a plan                          | Implements ONE task, returns results                                    |
| **reviewer** | Need critical feedback on anything                    | Questions everything, finds holes                                       |
| **verifier** | Acceptance review needs checking, verification needed | Verifies outcomes and returns evidence plus recommended tracker actions |

## Parallel execution and after-agents protocol

**Parallel execution:** When multiple tasks are ready and independent, spawn taskers in parallel (single message, multiple tool calls). Parallelize only when tasks do not share mutable files or hidden sequencing constraints. Keep tracker mutations out of subagents — only the orchestrator writes to beads, and only serially.

**After agents complete:** First apply all resulting tracker comments, bug creation, status changes, dependency updates, and closures yourself in a serialized order. Then check `bd ready` for newly unblocked tasks and continue until done.

**Subagent context:** Project context (AGENTS.md) is injected into all subagent sessions automatically. When spawning a tasker, focus the prompt on the task — no need to repeat project conventions.

## Git safety rules

When committing (orchestrator or tasker):

- **NEVER** force push or use `--force-with-lease`
- **NEVER** skip pre-commit hooks (`--no-verify`)
- **NEVER** amend commits that have been pushed to remote
- **NEVER** commit secrets (`.env`, credentials, API keys)
- **Warn** when committing directly to `main` or `master`
- If push fails, report the error — do NOT retry with force

## Beads core philosophy

> Review and verification produce new work — they do not rewrite old work.

- **Closed work is NOT reopened** — create new issues instead
- **Acceptance review tasks block, don't approve** — use them instead of a native beads `gate` type
- **History is immutable** — agents are predictable
- **Respect agent outputs** — when reviewer/tasker/verifier return findings or proposed tracker changes, record them in beads yourself without dropping information
