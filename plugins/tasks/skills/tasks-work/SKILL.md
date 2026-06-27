---
name: tasks-work
description: "Run ready taskmgr tasks end to end — implement → verify → record, then verify (never auto-close) the parent epic."
user-invocable: true
disable-model-invocation: true
---

# Running ready work

Take ready taskmgr tasks through implementation, verification, and recording — driven by the bundled
`work.js` workflow. You confirm the scope here in the main loop, then hand the resolved task ids to
the workflow, which fans out one `implementer` per task, verifies each (review ∥ test), and records
the outcome. Epics are verified and left for a human to close.

## 1. Preconditions

First, **load the `tasks` skill** for the CLI surface and the taskmgr gotchas it relies on
(closure is not gated, concurrent writes are safe). Then confirm the tracker is usable — probe binary and store separately (`taskmgr list` resolves the
store by walking up; do **not** use `ls .tasks/`, which only sees cwd):

```bash
command -v taskmgr >/dev/null 2>&1   # binary installed?
taskmgr list >/dev/null 2>&1          # store resolves?
```

If `command -v taskmgr` fails (no binary) or `taskmgr list` fails (no store resolves), stop and tell
the user (see the `tasks` skill, "Is taskmgr available?").

## 2. Discover ready work

```bash
taskmgr ready --json        # open tasks with no open blockers — priority, then oldest
```

If nothing is ready, report that and stop. Otherwise present the ready queue briefly (id, type,
priority, title).

## 3. Confirm scope (do not skip)

Ask the user via `AskUserQuestion` which scope to run:

- **All ready** — every task `taskmgr ready` returned.
- **A subset** — specific ids the user picks.
- **One epic** — run that epic's ready children, then verify the epic.

Resolve the selection to a concrete list of task ids:

- For a subset or all-ready, that is the ready ids the user kept.
- For an epic, list its ready children with
  `taskmgr list -q 'parent == "<epic-id>" && ready' --json` (substitute the real epic id; ids are
  opaque short codes; the `ready` predicate excludes children that are blocked or already in
  progress). Capture the `<epic-id>` separately for epic verification. This run-selection query
  differs on purpose from the epic-close gate the workflow runs later (`status != "closed"`, which
  asserts every child is *done* — a different question).

Nothing runs until the user confirms.

> Grilling is **advisory** here, not a gate — `tasks-work` does not require a plan-review pass before
> running. If the user wants the plan challenged first, point them at `/project-review-grill`.

## 4. Launch the workflow

Call the **Workflow** tool with the bundled script and the resolved scope as `args`:

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/work.js",
  args: { taskIds: ["<id>", "<id>", …], epicId: "<epic-id-or-omit>" }
})
```

Pass `epicId` only when running an epic (it drives the epic-verification stage). The workflow owns
all sequencing — it runs the tasks **sequentially** (one implement→verify→record at a time, since
they share one working tree) — and every taskmgr read/write happens inside its agents. It runs in the
background; when it completes you receive its summary object (counts of closed / left-open /
inconclusive / skipped, plus the epic verdict) — then do step 5. No manual polling.

## 5. Report

When the workflow returns, relay its summary: how many tasks were **closed**, **left open** (a
verification failure — a bug was filed), **inconclusive** (an agent did not complete — left open, no
bug), or **skipped** (the ticket was unready or blocked — never started, no bug). For an epic, report
the verification verdict and that it is **ready for the user to close**
(the workflow never closes an epic). List any filed bug ids and suggest `taskmgr ready` for the next
batch.
