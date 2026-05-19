# Beads Acceptance Review Patterns

Acceptance review is a blocking gate that verifies the epic outcome, not just task completion count.

## Gate task requirements

Create a dedicated task per epic:

- `Acceptance Review: <Epic Name>`

Do **not** use a native beads `gate` issue type — model acceptance checks as normal tasks.

Create via `scripts/new-ar-task.sh <epic-id>` — the script generates the canonical body and links the parent-child dep.

Required checks:

- all implementation tasks are closed
- required tests/checks were run and passed
- discovered defects are tracked as bugs/tasks
- scope-level outcome matches epic success criteria

## Verifier behavior

Verifier should:

1. read epic plus all child task outcomes
2. verify acceptance criteria against actual evidence
3. return tracker-ready bug/task drafts for defects or missing coverage (caller creates them)
4. recommend closing the acceptance task only when the gate is satisfied — the orchestrator performs the close

Verifier should **not** modify tracker state directly and **not** silently reopen scope without a tracked issue.

## If acceptance fails

File follow-up issues and keep acceptance-review task open/blocked until resolved.

```bash
bd create --title="Found: <acceptance gap>" --type=bug --priority=1 --description="Discovered during acceptance review of <epic-id>. <details>"
```

## Epic closure rule

Close epic only when:

1. implementation tasks are complete
2. acceptance-review task is closed
