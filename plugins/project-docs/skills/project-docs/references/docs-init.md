# Create Project Docs

Primary entrypoint for the **create docs** flow.

Use this when a project needs first-time docs baseline creation or a baseline reset that should be treated as create-first work.

## Flow contract

- Goal: establish canonical docs taxonomy, file ownership boundaries, and routing.
- Scope: docs and AGENTS routing files only.
- Guardrail: create only files with real repository-local guidance; skip hollow docs.

## Required references

- Canonical doc set + ownership baseline: [project-setup.md](project-setup.md)
- Structural constraints: [project-structure.md](project-structure.md)
- Shared deep verification/support procedures: [project-docs-lifecycle.md](project-docs-lifecycle.md)
- AGENTS routing template: [agents-md-template.md](agents-md-template.md) — see also [../examples/AGENTS.md](../examples/AGENTS.md) for a worked example

## Create workflow

1. Inspect project root: check for existing `CLAUDE.md`, `AGENTS.md`, and `docs/`.
2. Establish canonical docs set and file ownership boundaries from [project-setup.md](project-setup.md).
3. Create only needed canonical files for topics that have real local guidance.
4. Create or refresh `AGENTS.md` using [agents-md-template.md](agents-md-template.md) as the structural template, keeping it concise and pointer-based.
5. Run `scripts/claude-md.sh init <repo-root>` to ensure `CLAUDE.md` exists with `@AGENTS.md` as its first non-empty line; the script handles all three states (missing, correct, needs prepend) atomically and never overwrites or moves existing content.
6. Run `scripts/verify.sh <repo-root>` to execute all Phase 7 mandatory checks (see [project-docs-lifecycle.md](project-docs-lifecycle.md) Phase 7 for what each check verifies).

## Output requirements

Report:

- files created (including `CLAUDE.md` and `AGENTS.md`)
- files intentionally skipped (with reason)
- verification results and unresolved follow-ups
