# Project-Doc Structure Guidance

This reference defines structure and routing constraints.

This file owns:

- mode/path rules
- structural constraints
- AGENTS routing structure

It does **not** own canonical doc-set definition or file ownership taxonomy; those live in [project-setup.md](project-setup.md).

## Mode-aware locations

Determine active mode/path rules before writing docs.

| Concern | Team mode | Stealth mode |
|---|---|---|
| AGENTS file | `AGENTS.md` | `.coder/AGENTS.md` |
| Topic docs directory | `docs/` | `.coder/docs/` |

Use placeholders during planning:

- `{agents_md}` for mode-correct AGENTS file
- `{docs}` for mode-correct docs directory

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
