---
name: beads-plan
description: "Do beads planning"
user-invocable: true
disable-model-invocation: true
---

We do now task planning using beads

## Core Rules

- **Beads is the tracker** — use `bd create`, `bd ready`, `bd close` for all task tracking
- **All beads writes are serialized and yours alone** — subagents may read tickets with `bd show`, but they MUST NOT run `bd create`, `bd update`, `bd close`, `bd comments add`, or `bd dep add`. Collect proposed tracker changes from subagents and apply them yourself, one write at a time, per workspace.
- **Do NOT use TodoWrite, TaskCreate, or markdown files** for task tracking when beads is active
- **Issue before execution** — ensure a beads issue exists before spawning a tasker (create it or confirm it exists)
- **Priority is numeric** — use 0-4 (P0-P4), NOT "high"/"medium"/"low"
- **Load the `beads-tasks` skill before touching beads (NON-NEGOTIABLE)** — Before creating OR updating ANY beads issue (`bd create`, `bd update`), you MUST load the `coder-beads` skill and follow its instructions for creating and managing issues. This applies everywhere — formal planning, ad-hoc work, discussion follow-ups, bug filing, ALL of it. Issues created without following the skill's instructions are garbage: vague descriptions, missing acceptance criteria, no file lists. No exceptions.
- **Beads MUST reflect reality (NON-NEGOTIABLE)** — Every decision, scope change, new insight, or shifted direction MUST be immediately reflected in the relevant tasks, bugs, and epics. If a discussion changes the approach, UPDATE the task description. If scope grows, CREATE new tasks. If a task becomes irrelevant, CLOSE it. Stale tickets are lies — they mislead every agent that reads them. There is NO acceptable reason for a beads issue to be out of date.

## Four Use Cases

### 1. Discussion / Exploration / Refine
User wants to discuss, explore, think through an approach, or refine existing work.
- Read code, answer questions, discuss architecture
- Help think through tradeoffs
- Don't push beads structure prematurely — be a collaborator first
- **When discussion changes anything tracked in beads — UPDATE IT IMMEDIATELY.** If a discussion refines scope, shifts approach, resolves open questions, or changes priorities, the relevant tasks, bugs, and epics MUST be updated before moving on. A discussion that changes direction without updating beads is a discussion that never happened.
- Use `bd update` to change descriptions, priorities, and labels. Use `bd comments add` to record decisions and context. Use `bd close` for tasks that are no longer relevant. Create new tasks for newly identified work.
- For tasks labeled `needs:discussion`: once the discussion resolves them, unblock them: `bd update <id> --status=open --remove-label needs:discussion` and update their description with the outcome.

### 2. Beads Planning
User explicitly wants a structured plan.
- Load the `beads-tasks` skill — you MUST follow its instructions for how to create and structure beads issues. Do NOT create issues from memory or improvisation.
- Create epic + tasks + acceptance review task, set dependencies
- Do NOT use a native beads `gate` issue type here. Model acceptance checks as normal tasks (for example `Acceptance Review: <epic title>`).
- Optionally spawn reviewer for critical feedback
- Present plan for user approval before executing

### 3. Execution Trigger
User has a plan and wants to execute it.
- Check `bd ready` for unblocked work
- Move selected tasks to `in_progress` yourself before spawning subagents
- Spawn taskers for ready tasks (parallel when independent)
- After taskers return, apply all resulting tracker comments, bug creation, status changes, dependency updates, and closures yourself in a serialized order
- Then check `bd ready` for newly unblocked work
- Spawn verifier for acceptance review tasks when implementation tasks are done
- Commit when appropriate — you decide when
- Close epic when everything passes

### 4. Simple / Ad-hoc Work
User wants something done that doesn't need a full epic.
- Do it directly — no tasker roundtrip needed
- Commit if appropriate
- Create beads after the fact if tracking is desired, or skip beads entirely

## Finding Work

```bash
bd ready                       # Unblocked work ready to start
bd list --status=open           # All open issues
bd list --status=in_progress    # Currently active work
bd show <id>                    # Full details with dependencies
bd blocked                      # What's stuck and why
```

## Decision Framework

**Use beads when:** Multi-step work, multiple files, needs tracking, benefits from structure.
**Just do it when:** Single file, quick fix, discussion-driven change, user says "just do it."

When in doubt, ask the user.

## Agent Delegation

| Agent | When to Spawn | What They Do |
|-------|---------------|--------------|
| **tasker** | Structured tasks from a plan | Implements ONE task, returns results |
| **reviewer** | Need critical feedback on anything | Questions everything, finds holes |
| **verifier** | Acceptance review needs checking, verification needed | Verifies outcomes and returns evidence plus recommended tracker actions |

**Parallel execution:** When multiple tasks are ready and independent, spawn taskers in parallel (single message, multiple tool calls), but keep tracker mutations out of those subagents. Only you write to beads, and only serially.

**Subagent context:** Project context (AGENTS.md) is injected into all subagent sessions automatically. When spawning a tasker, focus the prompt on the task — no need to repeat project conventions.

**After agents complete:** First apply tracker updates serially, then check `bd ready` for newly unblocked tasks and continue until done.

## Git Safety Rules

When committing (you or tasker):
- **NEVER** force push or use `--force-with-lease`
- **NEVER** skip pre-commit hooks (`--no-verify`)
- **NEVER** amend commits that have been pushed to remote
- **NEVER** commit secrets (`.env`, credentials, API keys)
- **Warn** when committing directly to `main` or `master`
- If push fails, report the error — do NOT retry with force

## Beads Core Philosophy

> Review and verification produce new work — they do not rewrite old work.

- **Closed work is NOT reopened** — create new issues instead
- **Acceptance review tasks block, don't approve** — use them instead of a native beads `gate` type
- **History is immutable** — agents are predictable
- **Respect agent outputs** — when reviewer/tasker/verifier return findings or proposed tracker changes, record them in beads yourself without dropping information

## Beads Planning Guidelines
- Read and search the codebase (don't edit during planning)
- Create and manage beads issues
- Spawn subagents for execution, review, verification
- Switch to direct editing only for ad-hoc work or simple changes
