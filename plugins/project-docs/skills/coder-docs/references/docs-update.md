# Update Docs to Match Project Truth

Primary entrypoint for the **update docs** flow.

Use this when docs already exist but are stale, inaccurate, or misrouted and need factual correction.

## Safety contract (mandatory)

- **Docs-only scope:** edit documentation and AGENTS routing files only.
- **No source edits:** do not modify application/source files, runtime code, configs unrelated to docs routing, or tracker state.
- **Verify before claiming done:** corrected statements must be checked against repository truth.

## Required references

- Canonical doc set + ownership boundaries: [project-setup.md](project-setup.md)
- Mode/path and structural constraints: [project-structure.md](project-structure.md)
- Authoring quality rules: [project-doc-guidelines.md](project-doc-guidelines.md)
- Shared lifecycle procedures and verification: [project-docs-lifecycle.md](project-docs-lifecycle.md)

## Update workflow

1. Resolve mode/path rules with [project-structure.md](project-structure.md).
2. Inspect canonical docs + non-standard docs and gather stale/inaccurate claims.
3. Map each claim to canonical destination using [project-setup.md](project-setup.md).
4. Apply factual updates in docs files only.
5. Refresh AGENTS routes if doc paths/ownership changed.
6. Run lifecycle verification checks (Phase 7 in [project-docs-lifecycle.md](project-docs-lifecycle.md)).

## Output requirements

Report:

- explicit statement that scope stayed docs-only with no source-file edits
- docs updated and why
- claims verified (paths/commands/routes)
- unresolved gaps or follow-up suggestions
