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
5. **CLAUDE collapse step** — see [CLAUDE migration step](#claude-migration-step) below. CLAUDE.md must end this step as exactly `@AGENTS.md` (one line, optional trailing newline).
6. Run `scripts/verify.sh <repo-root>` to execute all Phase 7 mandatory checks (see [project-docs-lifecycle.md](project-docs-lifecycle.md) Phase 7 for what each check verifies).

## CLAUDE migration step

CLAUDE.md is contractually exactly `@AGENTS.md` and nothing else. If the file already exists with other content (framing text, embedded handbooks, injected tool blocks, personal notes), migrate first, then collapse.

1. Run `scripts/claude-md.sh check <repo-root>`.
2. If it reports **OK** or the file is missing: run `scripts/claude-md.sh init <repo-root>` and you are done with this step.
3. If it reports **INVALID** with extra content:
   a. Read the existing CLAUDE.md content.
   b. Classify every non-`@AGENTS.md` piece by destination:
      - routing/use-case section → migrate to `AGENTS.md` (use [agents-md-template.md](agents-md-template.md))
      - topic procedure → migrate to the matching `docs/<TOPIC>.md` (create the topic doc if absent and the content is substantive)
      - personal/local note → tell the user to put it in `.claude.local.md` (skill workflows never write that file)
      - auto-injected `<!-- BEGIN X --> ... <!-- END X -->` block → delete; the source tool already injects equivalent context at session start (e.g. `bd prime`)
   c. Present each migration using the [per-edit format](docs-update.md#per-edit-format) and get per-edit approval.
   d. Apply the approved migrations.
   e. Run `scripts/claude-md.sh init --rewrite <repo-root>` to collapse CLAUDE.md to the canonical one line. This is destructive; only run after the migration above is applied.
4. Re-run `scripts/claude-md.sh check <repo-root>` — must report OK.

## Output requirements

Report:

- files created (including `CLAUDE.md` and `AGENTS.md`)
- files intentionally skipped (with reason)
- verification results and unresolved follow-ups
