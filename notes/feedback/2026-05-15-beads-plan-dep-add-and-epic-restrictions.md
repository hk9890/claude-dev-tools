# Feedback: `bd dep add` argument order and epic dependency restrictions

**Date:** 2026-05-15  
**Project:** beads-workbench  
**Skill invoked:** `/beads-tasks:beads-plan`  
**Plugin version:** beads-tasks 1.2.0  
**Reporter:** Claude (post-session self-review, triggered by user)

---

## Summary

During a planning session using `/beads-tasks:beads-plan`, two runtime failures occurred that are directly traceable to documentation defects in the plugin:

1. `bd dep add` produced backwards dependencies on the first attempt because the argument labels in `beads-issue-workflow.md` are ambiguous or reversed relative to actual CLI behaviour.
2. `bd dep add <epic-id> <task-id>` failed with an undocumented runtime error: *"epics can only block other epics, not tasks"* — a constraint that appears nowhere in the plugin docs and that the example in `planning.md` violates.

A third issue (agent never ran `bd prime` as instructed by `CLAUDE.md`) was an agent-side miss but is noted for completeness.

---

## Context

The user asked for a plan covering two features for the `beads-workbench` TUI app:

- Add progress-aware loading feedback during initial board load
- Show a dedicated error screen when `bd` (the beads CLI) is not installed

The planner created one epic, two implementation tasks, and one acceptance-review gate task, then attempted to wire dependencies so that the acceptance review is blocked until both implementation tasks are closed.

---

## Incident 1 — `bd dep add` produced reversed dependencies

### What happened

After creating the four issues, the planner ran:

```bash
bd dep add beads-workbench-5rjj beads-workbench-5j04
bd dep add beads-workbench-h3zu beads-workbench-5j04
```

The intent was: *"acceptance review (5j04) should be blocked until both implementation tasks (5rjj, h3zu) complete."*

The actual output was:

```
✓ Added dependency: beads-workbench-5rjj (Investigate...) depends on beads-workbench-5j04 (Acceptance Review...) (blocks)
✓ Added dependency: beads-workbench-h3zu (Add beads health check...) depends on beads-workbench-5j04 (Acceptance Review...) (blocks)
```

This is the exact opposite of the intent: the implementation tasks were now waiting on the acceptance review to complete before they could start.

The planner detected the error, ran `bd dep remove` twice to undo, then re-issued the commands with swapped arguments:

```bash
bd dep add beads-workbench-5j04 beads-workbench-5rjj
bd dep add beads-workbench-5j04 beads-workbench-h3zu
```

Output:

```
✓ Added dependency: beads-workbench-5j04 (Acceptance Review...) depends on beads-workbench-5rjj (Investigate...) (blocks)
✓ Added dependency: beads-workbench-5j04 (Acceptance Review...) depends on beads-workbench-h3zu (Add beads health check...) (blocks)
```

This is correct. Total extra tool calls: 4 (2 wrong adds + 2 removes).

### Root cause

`beads-issue-workflow.md` line 57 documents the command as:

```
bd dep add <parent-or-blocked-by-id> <dependent-id>
```

The label `<parent-or-blocked-by-id>` is the problem. It combines two terms that point in opposite directions:

- **"parent"** — in issue trackers, a parent is a prerequisite; it must complete before its children. This implies the first arg is the **blocker/prerequisite**.
- **"blocked-by"** — ambiguous. In English, "blocked-by" can mean either:
  - the entity *doing* the blocking (the prerequisite), or
  - the entity *being* blocked (the dependent/waiting task).

The planner read "parent-or-blocked-by" as "the thing that blocks others" (i.e., the prerequisite), put the implementation task first, and got it backwards.

**Actual CLI behaviour:** `bd dep add <dependent-id> <prerequisite-id>` — the **first** argument is the task that will wait; the **second** argument is the task that must complete first.

### Suggested fix

Replace the ambiguous label with directional, unambiguous names:

```
bd dep add <waiting-task-id> <prerequisite-task-id>
```

Or equivalently:

```
bd dep add <blocked-task-id> <blocking-task-id>
```

Add a one-line plain-English clarification immediately after:

> The first argument is the task that cannot start until the second argument is closed.

A concrete before/after example would also help:

```bash
# Acceptance review (AR) must wait until implementation (IMPL) is done:
bd dep add <AR-id> <IMPL-id>
```

---

## Incident 2 — Epic → task dependency fails with undocumented error

### What happened

Before the reversed-dependency error was identified, the planner first attempted to link the epic to the implementation tasks (to model "this epic contains these tasks"):

```bash
bd dep add beads-workbench-pwn6 beads-workbench-5rjj
```

Runtime error:

```
Error: epics can only block other epics, not tasks
```

The planner abandoned this approach and moved on to wiring only task-to-task dependencies. The epic remained unconnected.

### Root cause

Two separate problems:

**Problem A — The restriction is undocumented.**  
Neither `beads-issue-workflow.md` nor `planning.md` nor `core-rules.md` mentions that epics cannot have tasks as dependency targets. There is no warning, no note, no alternative pattern offered.

**Problem B — The `planning.md` example actively demonstrates the broken pattern.**  
`planning.md` lines 44–67 show the canonical "create an epic + acceptance-review gate" pattern and end with:

```bash
bd dep add <epic-id> <acceptance-review-id>
```

The acceptance review is created as `--type=task` in the same example. This `bd dep add` call will fail at runtime for any agent following this pattern literally. The example is broken.

**Additionally:** there is no documented mechanism for associating tasks with their parent epic at all. No `--epic` flag exists on `bd create`, no `bd epic link` command is shown anywhere. The result is that the epic sits disconnected in `bd ready` alongside its child tasks, with no structural relationship visible in the tracker.

### Suggested fixes

1. **Document the restriction** clearly in `beads-issue-workflow.md` under the "Dependencies and ordering" section:

   > Note: epics cannot be used as a dependency target for tasks. Use task-to-task dependencies to express ordering within an epic.

2. **Fix the broken example** in `planning.md`. Remove or replace the `bd dep add <epic-id> <acceptance-review-id>` line. If there is a supported way to associate tasks with an epic, show that instead. If there is not, make that explicit.

3. **Document how tasks are associated with an epic** — even if the answer is "they aren't formally linked; the epic is advisory". Agents need to know this to set correct expectations.

---

## Incident 3 — Agent skipped `bd prime` (agent-side miss)

### What happened

`CLAUDE.md` instructs:

> Run `bd prime` to see full workflow context and commands.
> Run `bd prime` for detailed command reference and session close protocol.

The planner loaded the plugin reference files directly (`planning.md`, `beads-issue-workflow.md`, etc.) but never ran `bd prime`. If `bd prime` output includes correct argument-order examples or constraint notes that the static docs lack, this miss may have contributed to both incidents above.

### Note for analysis

This is an agent compliance issue, not a documentation bug. However, if `bd prime` output does contain correct `bd dep add` examples or mentions the epic-restriction, it would indicate that the plugin's static docs and its live `bd prime` output are out of sync — which is itself a documentation maintenance problem worth flagging.

---

## Impact summary

| Incident | Extra tool calls | End state |
|---|---|---|
| Reversed `dep add` args | +4 (2 wrong adds, 2 removes) | Corrected; final deps are right |
| Epic → task dep failure | +1 (failed command) | Epic left unlinked; tasks correctly linked |
| Skipped `bd prime` | — | Unknown; possible missed context |

The final plan is structurally correct. The issues, instructions, and task-to-task dependencies are all valid. The only residual gap is the epic being unconnected to its child tasks in the tracker.

---

## Files to fix

| File | Line | Problem |
|---|---|---|
| `skills/beads-core/references/beads-issue-workflow.md` | 57 | `<parent-or-blocked-by-id>` label is ambiguous; reverse of actual behaviour |
| `skills/beads-core/references/planning.md` | 66 | `bd dep add <epic-id> <acceptance-review-id>` fails at runtime |
| `skills/beads-core/references/planning.md` | 44–67 | No documented mechanism for associating tasks with an epic |
| (any) | — | Epic → task dep restriction undocumented anywhere |
