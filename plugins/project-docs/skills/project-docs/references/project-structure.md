# Project-Doc Structure Guidance

This reference defines structure and routing constraints.

This file owns:

- structural constraints
- AGENTS routing structure rules

It does **not** own canonical doc-set definition or file ownership taxonomy; those live in [project-setup.md](project-setup.md).

## Canonical locations

All docs live at the project root or in `docs/`:

| File | Location |
|---|---|
| `CLAUDE.md` | project root |
| `AGENTS.md` | project root |
| Topic docs | `docs/` |

`CLAUDE.md` must contain **exactly** `@AGENTS.md` and nothing else (one line, optional trailing newline). The `@`-import triggers Claude Code to load the routing table at session start; any additional content belongs in `AGENTS.md` (routing) or a topic doc under `docs/`. See [project-setup.md#claude-md](project-setup.md) for the full ownership contract.

## Structural constraints

- Use canonical topic names defined by [project-setup.md](project-setup.md).
- Keep AGENTS concise and pointer-based.
- Keep routes aligned to real files/skills only.
- Treat non-standard docs as consolidation candidates unless explicitly justified.

## AGENTS routing rules

- Keep AGENTS concise and pointer-based.
- Preserve custom non-template sections unless obsolete.
- Ensure every route points to a real file or installed skill.
- Keep AGENTS guidance as a routing layer, not a full procedure handbook.

## Consolidation orientation

When non-standard docs exist, classify and decide keep/merge/split/delete before declaring refresh complete.

- Prefer canonical steering docs as operating layer.
- Keep non-standard files only with explicit scoped justification.
- Clean stale routes after merges/deletions.
