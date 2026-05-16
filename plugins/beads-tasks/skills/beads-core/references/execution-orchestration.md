# Beads Execution Orchestration

Run planned work safely. The orchestrator owns all tracker writes; subagents do the work and return tracker-ready proposals.

See [core-rules.md](core-rules.md) for serialized writes, agent delegation, and parallel execution rules.

## Step 1 — Plan-review gate (mandatory)

Before executing any task, verify the parent epic (or the standalone task, if no epic) has been reviewed.

Evidence of review:

- A reviewer grill sheet captured as comments on the epic with resolved answers
- The `need:review` label removed
- An explicit `reviewed` marker on the issue

If no evidence exists, spawn a **reviewer** in plan-grilling mode (see `agents/reviewer.md` → Plan Grilling). The reviewer returns a **grill sheet**: an ordered list of pointed questions, each with a recommended answer, source citation, and "why it matters".

Walk the grill sheet **with the user, one question at a time**:

- Present the question, the reviewer's recommended answer, and the source.
- Capture the user's answer (accept, override, or defer).
- For each resolved answer, write a tracker comment on the epic recording the decision (orchestrator writes — never the reviewer).
- If an answer changes scope, update the relevant task descriptions before moving on. Stale tickets are not allowed (see core-rules.md).

Only after all blocking questions are resolved: remove the `need:review` label and proceed. Do NOT spawn taskers against an epic with unresolved grill questions.

## Step 2 — Pre-execution ticket check

Before implementing each task:

1. `bd show <id>` — read description, instructions, and comments in full.
2. If labels include `needs:discussion` or `has:open-questions`, stop.
3. If comments contain scope decisions not reflected in the body, treat as stale and stop.
4. If acceptance criteria are ambiguous or not testable, stop and comment.

When blocked by quality gaps:

```bash
bd comments add <id> "Cannot execute: <specific gaps>"
```

If a subagent found the blocker, have it return tracker-ready comment text and apply it from the orchestrator.

## Step 3 — Execution loop

1. Check actionable work: `bd ready`.
2. Pick independent tasks.
3. Claim them serially from the orchestrator: `bd update <id> --status=in_progress`.
4. Spawn the right agent for each task:
   - **tasker** — implementation work. ONE task per tasker. Run independent taskers in **parallel** (single message, multiple tool calls) when their tasks do not share mutable files or sequencing constraints; otherwise serially. The orchestrator MUST NOT implement task work directly.
   - **verifier** — acceptance-review tasks only. Validates that implementation tasks were executed properly against the epic's acceptance criteria; returns evidence plus recommended tracker actions.
5. After each batch: apply all proposed tracker updates (comments, status changes, bugs, closures) serially from the orchestrator.
6. Re-check `bd ready` and repeat until done or blocked.

## Handling failures

- **Task-related failure**: fix within task scope, rerun checks.
- **Unrelated failure**: create a follow-up bug from the orchestrator and continue if possible.

```bash
bd create --title="Found: <description>" --type=bug --priority=2 --description="Discovered while working on <task-id>. <details>"
```

## Orchestration checkpoints

At each iteration capture:

- `bd ready` (what can run now)
- `bd blocked` (what needs dependencies/discussion)
- `bd status` (overall progress)

## Closure order

1. Close implementation tasks serially from the orchestrator.
2. Run the acceptance-review task with a verifier.
3. Close the epic only when the acceptance-review gate is closed.

See [beads-acceptance-review.md](beads-acceptance-review.md).
