# Beads Issue Workflow & Task Structure

How to structure beads issues so execution agents can run safely and predictably.

## Minimum issue sections for execution tasks

- **Description**: what outcome is needed and why
- **Instructions**: concrete step-by-step implementation plan
- **Acceptance Criteria**: binary, testable checks
- **Files to Modify** (when known): explicit create/update/delete targets

## Labels and meaning

- `needs:discussion` — not executable yet; user/scoping decision required
- `has:open-questions` — unresolved questions remain
- `need:review` — requires explicit planning/review gate
- `source:external` — externally reported bug
- `risk:high`, `area:<name>` — optional routing labels

## Block unresolved work immediately

```bash
cat << 'EOF' | bd create --title="Design token refresh strategy" --type=task --priority=1 --labels=needs:discussion --body-file -
## Description
Decide token refresh strategy.

## Open Questions
- [ ] Should refresh be automatic or explicit?
- [ ] What expiry window should be used?

## Why This Needs Discussion
Implementation depends on product/security decisions.
EOF

bd update <id> --status=blocked
```

For mostly-ready tasks with minor unknowns:

```bash
bd create --title="..." --type=task --labels=has:open-questions --body-file -
bd update <id> --status=blocked
```

Unblock only after decisions are captured:

```bash
bd update <id> --status=open --remove-label needs:discussion
bd update <id> --status=open --remove-label has:open-questions
```

## Dependencies and ordering

Use dependency edges for strict ordering.

```bash
bd dep add <parent-or-blocked-by-id> <dependent-id>
```

Guideline:

- dependency only for true execution order constraints
- avoid over-linking unrelated tasks
- block edges must connect same-type issues: an epic can only block another epic, and a task can only block another task. Linking across types fails with `epics can only block other epics, not tasks` (or the task equivalent). To order a task against an epic, depend on a task inside that epic instead.

## Acceptance-review task pattern

Every epic should have an explicit gate task:

- `Acceptance Review: <Epic Name>`

This gate closes only after implementation and verification outcomes are complete.

See [beads-acceptance-review.md](beads-acceptance-review.md).

## Follow-up issue filing during execution

When unrelated issues are discovered while executing another task, file them immediately:

```bash
bd create --title="Found: <description>" --type=bug --priority=2 --description="Discovered while working on <task-id>. <details>"
```

Do not silently ignore unrelated defects.
