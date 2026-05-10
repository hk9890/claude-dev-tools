# Create Project Docs

Primary entrypoint for the **create docs** flow.

Use this when a project needs first-time docs baseline creation or a baseline reset that should be treated as create-first work.

## Flow contract

- Goal: establish canonical docs taxonomy, file ownership boundaries, and mode-correct routing.
- Scope: docs and AGENTS routing files only.
- Guardrail: create only files with real repository-local guidance; skip hollow docs.

## Required references

- Canonical doc set + ownership baseline: [project-setup.md](project-setup.md)
- Mode/path rules + structural constraints: [project-structure.md](project-structure.md)
- Shared deep verification/support procedures: [project-docs-lifecycle.md](project-docs-lifecycle.md)
- AGENTS routing template: [agents-md-template.md](agents-md-template.md)

## Create workflow

1. Resolve mode/path rules from [project-structure.md](project-structure.md):
   - `team` mode → project-shared path such as `AGENTS.md` and `docs/`
   - `stealth` mode → local path such as `.coder/AGENTS.md` and `.coder/docs/`
2. Inspect existing docs and AGENTS state.
3. Establish canonical docs set and file ownership boundaries from [project-setup.md](project-setup.md).
4. Create only needed canonical files for topics that have real local guidance.
5. Add or refresh AGENTS routing using [agents-md-template.md](agents-md-template.md), keeping AGENTS concise and pointer-based.
6. Run lifecycle verification checks from [project-docs-lifecycle.md](project-docs-lifecycle.md) Phase 7.

## Output requirements

Report:

- selected mode/paths
- files created
- files intentionally skipped (with reason)
- verification results and unresolved follow-ups
