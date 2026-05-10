---
name: coder-beads
description: "Use this skill for beads-centric planning, issue structure, execution orchestration, acceptance review gates, beads setup/runtime troubleshooting, beads health checks, and beads follow-up bug/task filing when users ask to capture tracker bugs/tasks (for example with repro and expected vs actual), even without explicitly saying beads. Trigger only for beads tracker workflow requests. Do not trigger for external task-sync/import-export workflows (GitHub issues/Jira), docs lifecycle/taxonomy cleanup, GitHub releases, or general coding tasks."
---

# coder-beads

## Orchestration Rules (apply whenever this skill is active)

When this skill is loaded, Claude Code acts as the orchestrator. These rules are NON-NEGOTIABLE:

- **Beads is the tracker** — use `bd create`, `bd ready`, `bd close` for all task tracking; do NOT use TodoWrite or TaskCreate when beads is active
- **All beads writes are serialized and yours** — subagents (tasker, reviewer, verifier) may read tickets with `bd show`, but they MUST NOT run `bd create`, `bd update`, `bd close`, `bd comments add`, or `bd dep add`; collect proposed tracker changes from subagents and apply them yourself, one write at a time
- **Use planning mode for discussion/planning** — when the user wants to discuss, explore, or structure a plan, enter plan mode (`/plan`); create the beads plan, get user approval, then execute
- **Issue before execution** — ensure a beads issue exists before spawning a tasker
- **Priority is numeric** — use 0-4 (P0-P4), NOT "high"/"medium"/"low"
- **Beads MUST reflect reality (NON-NEGOTIABLE)** — every decision, scope change, new insight, or shifted direction MUST be immediately reflected in the relevant tasks, bugs, and epics; stale tickets are lies

## Subagent delegation

| Agent | When to spawn | What they do |
|-------|---------------|--------------|
| **tasker** | Structured tasks from a plan | Implements ONE task, returns results |
| **reviewer** | Need critical feedback on anything | Questions everything, finds holes |
| **verifier** | Acceptance review needs checking | Verifies outcomes, returns evidence |

**Parallel execution:** Spawn multiple taskers in parallel when tasks are independent. Keep all tracker mutations out of subagents — only you write to beads, and only serially.

**After agents complete:** Apply tracker updates serially, then check `bd ready` for newly unblocked tasks.

## Session close protocol

Before ending a session where work was done:

```bash
git status           # 1. Check what changed
git add <files>      # 2. Stage code changes
git commit -m "..."  # 3. Commit (pre-commit hook exports beads state)
git push             # 4. Push to remote — work is NOT done until this succeeds
```

Never force-push, skip hooks, or amend published commits.

## Workflow routing

| Need | Source of truth |
|---|---|
| Build an epic + tasks plan | [references/planning.md](references/planning.md) |
| Structure issues, labels, dependencies | [references/beads-issue-workflow.md](references/beads-issue-workflow.md) |
| Run execution orchestration (ready queue, parallelization) | [references/execution-orchestration.md](references/execution-orchestration.md) |
| Run acceptance-review and close criteria | [references/beads-acceptance-review.md](references/beads-acceptance-review.md) |
| Initialize and set up beads | [references/beads-init.md](references/beads-init.md) |
| Troubleshoot broken beads setup/runtime | [references/beads-setup-troubleshooting.md](references/beads-setup-troubleshooting.md) |
| Diagnose runtime/beads database failures | [references/beads-runtime-troubleshooting.md](references/beads-runtime-troubleshooting.md) |
| Quick status/health verification | [references/beads-status-health.md](references/beads-status-health.md) |
| File tracker follow-ups / bug reports with evidence | [references/beads-bug-reporting.md](references/beads-bug-reporting.md) |

## Additional routing

- For docs lifecycle or AGENTS authoring work, use the `project-docs` plugin if installed.
