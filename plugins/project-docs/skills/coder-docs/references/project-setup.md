# Project-Doc Setup

Use this reference to establish the canonical project-doc baseline.

This file owns:

- canonical doc set
- file ownership boundaries
- taxonomy baseline

## Baseline model

- `README.md`: user-facing project entrypoint
- `AGENTS.md`: routing layer (routing table for all AI tools)
- `CLAUDE.md`: Claude Code entrypoint — contains `@AGENTS.md` and any Claude-specific overrides
- `docs/` topic files: durable repo-specific operating guidance

Create topic docs only when the repository has real local guidance for that topic.

## Canonical topic set

Use these names when relevant:

```text
docs/
  OVERVIEW.md
  CODING.md
  TESTING.md
  RELEASING.md
  MONITORING.md
  CHANGE-WORKFLOW.md
```

Notes:

- `CHANGE-WORKFLOW.md` is the canonical location for change-landing guidance.
- If a reusable skill fully covers a topic and there is no local delta, do not create a hollow doc for that topic.

## File ownership boundaries

### `CLAUDE.md`

- Claude Code entrypoint: `@AGENTS.md` as first line
- May include Claude-specific session rules or overrides below the import
- Keep minimal; delegate routing to `AGENTS.md`

### `README.md`

- Project identity and front-door usage context
- Links to deeper docs

### `AGENTS.md`

- Routing table only
- Short project summary + task-to-doc/skill routes
- Avoid duplicating full procedures

### `docs/OVERVIEW.md`

- Architecture and domain orientation

### `docs/CODING.md`

- Repository-specific implementation constraints and edit patterns

### `docs/TESTING.md`

- Test-layer policy, commands, and minimum checks

### `docs/RELEASING.md`

- Repo-specific release constraints and entrypoints

### `docs/MONITORING.md`

- Repo-specific observability and evidence paths

### `docs/CHANGE-WORKFLOW.md`

- Commit/push/branch/PR/review/merge expectations

## Boundary to project-structure

`project-setup.md` defines **what docs exist and who owns what**.

Use [project-structure.md](project-structure.md) for:

- structural constraints
- AGENTS routing structure rules
