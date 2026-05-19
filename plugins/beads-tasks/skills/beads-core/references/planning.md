# Beads Planning Reference

Guide for creating epics, tasks, acceptance-review tasks, and beads execution plans.

## Planning Workflow

1. Review the current conversation to understand what to build or fix.
2. Context sufficiency is already confirmed before arriving here (done by planning-intake.md).
3. Choose epic+tasks or standalone tasks. Use an **epic** when any of these are true: (a) the work needs an acceptance-review gate, (b) it splits into 2+ implementation tasks that could run independently, or (c) it involves multiple agent types (e.g. tasker + reviewer + verifier). Otherwise use a **standalone task**.
4. Create the epic and tasks — follow issue structure rules in this file and beads-issue-workflow.md.
5. Set dependencies with `bd dep add`.
6. Present the plan to the user — brief summary of what will be built and in what order.

## Beads issue types

| Type    | Use when                                                                |
|---------|-------------------------------------------------------------------------|
| epic    | Initiative spanning multiple dependent issues                           |
| task    | Atomic work that doesn't fit a more specific type (default)             |
| bug     | Something is broken vs. documented/intended behavior                    |
| feature | New user-visible capability                                             |
| chore   | Maintenance, refactor, tech debt, dependency bumps, cleanup — no user-visible behavior change |

We do not use the `decision` type — record decisions as comments on the relevant task or epic.

## Planner quality bar

Every execution task must be runnable without guessing.

Checklist:

- clear implementation intent and scope
- concrete instructions (ordered steps)
- explicit file targets when known
- testable success criteria (see `ticket-rules.md`)
- prefer the simplest design that satisfies the goal — no speculative abstractions
- no unresolved open questions

If unresolved questions remain, mark the issue for discussion and block it (see issue workflow reference).

## Issue structure checklist

1. Define epic outcome and success criteria.
2. Break work into atomic tasks.
3. Create an explicit acceptance-review task.
4. Add dependencies so execution order is unambiguous.
5. Label discussion/risk/review cases.
6. Show actionable state (`bd ready`) and blocked state (`bd blocked`).

## Create an epic and acceptance-review gate

Create the epic with `bd create --type=epic ...`, then run `scripts/new-ar-task.sh <epic-id>` to create the canonical Acceptance Review task and link it parent-child. The script enforces the 4 required AC checkboxes.

## Create executable implementation tasks

```bash
cat << 'EOF' | bd create --title="Add JWT middleware" --type=task --priority=2 --body-file -
## Description
Protect API routes with JWT validation middleware.

## Instructions
1. Create `src/middleware/auth.ts` with token verification.
2. Validate Bearer token and attach decoded user context.
3. Return 401 for missing/invalid/expired token.

## Acceptance Criteria
- [ ] Middleware validates valid tokens
- [ ] Invalid/expired tokens return 401
- [ ] Missing auth header returns 401
- [ ] Relevant tests pass
EOF
```

## Ready-vs-discussion rule

If taskers would need to improvise, do **not** leave task ready.

- use `needs:discussion` when scope is blocked by unresolved decisions
- use `has:open-questions` when mostly-scoped work still has unresolved items
- keep both blocked until resolved

See [beads-issue-workflow.md](beads-issue-workflow.md) for exact commands.

## Execution handoff expectations

Before execution begins:

1. `bd ready` must show only executable work.
2. dependencies must reflect real order constraints.
3. acceptance-review task must exist for epic closure.
4. known gaps must be captured as blocked discussion tasks.
