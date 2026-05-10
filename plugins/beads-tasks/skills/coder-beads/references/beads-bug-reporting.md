# Beads Bug Reporting & Follow-up

How to file high-quality tracker follow-ups for issues discovered during planning/execution/review.

## What belongs here

File bugs/tasks for tracker workflow problems such as:

- ambiguous or stale issue definitions
- execution blockers not captured in dependencies
- acceptance-review gaps discovered during verification
- recurring beads setup/runtime failures

## Required evidence fields

Include in description:

1. where discovered (task/epic/review context)
2. expected behavior
3. actual behavior
4. minimal reproduction/trigger steps
5. impact (blocked work, wrong prioritization, data risk)

## Standard follow-up template

```bash
bd create --title="Found: <description>" --type=bug --priority=2 --description="Discovered while working on <task-id>. Expected: <...>. Actual: <...>. Repro: <...>."
```

## Subagent discovery routing

When a tasker, reviewer, or verifier discovers a defect:

- the subagent should return a tracker-ready bug draft plus evidence
- the orchestrator should create the bug
- keep bug creation serialized with other tracker writes for that workspace

For acceptance-review failures:

```bash
bd create --title="Found: <acceptance gap>" --type=bug --priority=1 --description="Discovered during acceptance review of <epic-id>. <details>"
```

## External vs internal discovery

- add `source:external` when issue came from user/customer report
- internal discovery can use default labels unless routing needs extra tags

## Quality rules

- one issue per defect pattern
- title states concrete symptom
- avoid vague descriptions like “doesn't work”
- never silently work around untracked defects
- do not rely on concurrent `bd` write failure as expected behavior; serialize tracker writes instead
