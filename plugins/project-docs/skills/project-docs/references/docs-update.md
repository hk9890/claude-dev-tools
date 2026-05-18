# Update Docs to Match Project Truth

Primary entrypoint for the **update docs** flow.

Use this when docs already exist but are stale, inaccurate, or misrouted and need factual correction.

## Safety contract (mandatory)

- **Docs-only scope:** edit documentation and AGENTS routing files only.
- **No source edits:** do not modify application/source files, runtime code, configs unrelated to docs routing, or tracker state.
- **Verify before claiming done:** corrected statements must be checked against repository truth.

## Required references

- Canonical doc set + ownership boundaries: [project-setup.md](project-setup.md)
- Structural constraints: [project-structure.md](project-structure.md)
- Authoring quality rules: [project-doc-guidelines.md](project-doc-guidelines.md)
- Shared lifecycle procedures and verification: [project-docs-lifecycle.md](project-docs-lifecycle.md)

## Update workflow

1. Inspect canonical docs + non-standard docs and gather stale/inaccurate claims.
2. **CLAUDE collapse step** — run the migration in [docs-init.md#claude-migration-step](docs-init.md#claude-migration-step). CLAUDE.md must end this step as exactly `@AGENTS.md` (one line); any extra content gets migrated to AGENTS.md / topic docs / `.claude.local.md` first, then the file is collapsed with `scripts/claude-md.sh init --rewrite`.
3. Map each claim to canonical destination using [project-setup.md](project-setup.md).
4. Apply factual updates in docs files only.
5. Refresh AGENTS routes if doc paths/ownership changed.
6. Run `scripts/verify.sh <repo-root>` to execute all Phase 7 mandatory checks (see [project-docs-lifecycle.md](project-docs-lifecycle.md) Phase 7 for what each check verifies).

## Output requirements

Report:

- explicit statement that scope stayed docs-only with no source-file edits
- docs updated, each shown using the [per-edit format](#per-edit-format) below
- claims verified (paths/commands/routes)
- unresolved gaps or follow-up suggestions

## Per-edit format

Every proposed change must be presented as:

```
### Update: <file>:<section>
**Why:** <one-line — what gap this closes or what fact this corrects>

```diff
<minimal diff>
```
```

Rationale: the `**Why:**` line acts as a self-check (if the change can't be justified in one line, it shouldn't be made) and lets reviewers accept or reject without re-deriving the rationale.
