# Project-Doc Setup

## Baseline model

- `README.md`: user-facing project entrypoint
- `AGENTS.md`: routing layer (routing table for all AI tools)
- `CLAUDE.md`: Claude Code entrypoint — **must contain exactly `@AGENTS.md` and nothing else** (one line, optional trailing newline). Any other content is a bug to migrate into AGENTS.md (for routing) or a topic doc under `docs/`. Enforced by `scripts/claude-md.sh check` and by the project-docs skill flows (which migrate content before collapsing the file).
- `docs/` topic files: durable repo-specific operating guidance
- `.claude.local.md` (optional, personal): per-user local context — gitignored; never written by canonical doc flows (create/update/improve/revise); surfaced by `scripts/inventory.py` so authors know it exists

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

- **Hard contract**: CLAUDE.md is exactly `@AGENTS.md` (one line, optional trailing newline). Anything else is a bug.
- New instructions/routing always go to `AGENTS.md`, never to `CLAUDE.md`.
- Existing non-canonical CLAUDE.md content (framing text, embedded handbooks, injected tool blocks, personal notes) MUST be migrated before the file is collapsed:
  - routing → `AGENTS.md`
  - topic procedures → the matching `docs/<TOPIC>.md`
  - personal/local notes → `.claude.local.md`
  - auto-injected tool blocks → topic doc under `docs/` or `.claude.local.md` (never in steering docs)
- Enforcement: `scripts/claude-md.sh check` hard-fails on extra content; `scripts/claude-md.sh init` aborts (exit 2) if the file has extra content. The destructive collapse `init --rewrite` is invoked by skill workflows *after* migration, not directly.
- Skill flows that perform the migration: `docs-init`, `docs-update`, `docs-revise`. See each flow's "CLAUDE.md migration step".

### `.claude.local.md` (optional, personal)

- Personal/local context only; gitignored, never shared with the team
- Never written by canonical doc flows (create/update/improve/revise) — the user edits this file directly
- Surfaced by `scripts/inventory.py` under `personal_local` so authors know it exists
- Use for: personal Claude preferences, machine-specific paths, in-progress scratch notes that should not land in shared docs

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
- MUST NOT duplicate `AGENTS.md` — no re-listing of the docs/skills it already routes to (see [project-doc-guidelines.md](project-doc-guidelines.md), rule A7)
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
