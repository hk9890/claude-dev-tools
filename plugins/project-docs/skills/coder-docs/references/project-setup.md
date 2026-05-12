# Project-Doc Setup

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

- If a reusable skill fully covers a topic and there is no local delta, do not create a hollow doc for that topic.

## File ownership boundaries

### `CLAUDE.md`
- Claude Code entrypoint: `@AGENTS.md` as first line
- MUST NOT CONTAIN ANYTHING ELSE. All the instruction always go to `AGENTS.md 

### `README.md`

- Project identity and front-door usage context
- Links to deeper docs
- Example: [../examples/README.md](../examples/README.md)

### `AGENTS.md`

- Routing table only
- Short project summary + task-to-doc/skill routes
- Avoid duplicating full procedures
- Example: [../examples/AGENTS.md](../examples/AGENTS.md)

### `docs/OVERVIEW.md`

- Architecture and domain orientation
- Example: [../examples/docs/OVERVIEW.md](../examples/docs/OVERVIEW.md)

### `docs/CODING.md`

- Repository-specific implementation constraints and edit patterns
- Example: [../examples/docs/CODING.md](../examples/docs/CODING.md)

### `docs/TESTING.md`

- Test-layer policy, commands, and minimum checks
- Example: [../examples/docs/TESTING.md](../examples/docs/TESTING.md)

### `docs/RELEASING.md`

- Repo-specific release constraints and entrypoints
- Example: [../examples/docs/RELEASING.md](../examples/docs/RELEASING.md)

### `docs/MONITORING.md`

- Repo-specific observability and evidence paths
- Example: [../examples/docs/MONITORING.md](../examples/docs/MONITORING.md)

### `docs/CHANGE-WORKFLOW.md`

- Commit/push/branch/PR/review/merge expectations
- Example: [../examples/docs/CHANGE-WORKFLOW.md](../examples/docs/CHANGE-WORKFLOW.md)

## Boundary to project-structure

`project-setup.md` defines **what docs exist and who owns what**.

Use [project-structure.md](project-structure.md) for:

- structural constraints
- AGENTS routing structure rules
