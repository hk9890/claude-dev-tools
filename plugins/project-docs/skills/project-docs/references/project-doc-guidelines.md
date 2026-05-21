# Project-Doc Authoring Guidelines

Authoring standard for canonical project docs.

Use with:

- [project-setup.md](project-setup.md)
- [project-doc-review-guidelines.md](project-doc-review-guidelines.md)

## Authoring objectives

1. Keep docs actionable for this repository.
2. Keep docs compact enough for selective loading.
3. Preserve strict topic boundaries.
4. Avoid duplicating reusable baseline workflows already provided by installed skills.

## Core rules

### A1 — Action-first writing

Prefer:

- commands
- file paths
- checklists
- decision tables

### A2 — Repo-local anchors required

Every operational rule should include at least one local anchor:

- command
- path
- test location
- workflow entrypoint

### A3 — Topic boundaries

Each canonical file should stay on its assigned topic.

### A4 — Skill-aware local delta

When a skill covers a generic workflow, local docs should only add repository-specific deltas.

### A5 — Scanability

- short sections
- short bullets
- explicit headings
- links over duplicated background

### A6 — Canonical change-landing placement

Change-landing guidance belongs in `CHANGE-WORKFLOW.md`.

### A7 — No duplication of AGENTS.md content

`AGENTS.md` is the single routing surface. Canonical `docs/` files MUST NOT restate
what `AGENTS.md` already provides:

- MUST NOT re-list files, directories, docs, or skills that `AGENTS.md` already routes to.
- MUST NOT duplicate the project summary, routing table, or task-to-doc/skill mappings.
- When a doc needs context that lives in `AGENTS.md`, link to it instead of copying it.

This applies with particular force to `docs/OVERVIEW.md`: its repository-layout and
resource sections describe structure and domain, not the routes already declared in
`AGENTS.md`.

## Hard prohibitions

Canonical docs should avoid:

- generic advice without local anchors
- large pasted code blocks when a file pointer is enough
- **auto-injected blocks** from external tools in `CLAUDE.md` or `AGENTS.md` — these files are hand-authored steering surfaces. Markers like `<!-- BEGIN <TOOL> -->` ... `<!-- END <TOOL> -->` belong in topic-specific docs under `docs/` (or, if the tool's content is truly transient/personal, in `.claude.local.md`). Detected by `scripts/inventory.py` and surfaced as warnings by `scripts/verify.sh`.
- **stub / placeholder docs** — files whose only content is a header plus "No rules yet", "TBD", "Coming soon", or similar. Delete the file; create it lazily when there is real content to record. A hollow doc imposes a cognitive cost (readers load it, find nothing, and lose trust in the doc set) without any payoff.

## Concrete rewrites

Side-by-side examples for the most common violations. Use these as templates when correcting drift.

### Generic advice → repo-local anchor (A1/A2)

**Bad** — generic, no anchors:

> Always run tests before pushing to ensure code quality.

**Good** — actionable, repo-local:

> Run `make test` from repo root before `git push`. CI also enforces this via `.github/workflows/ci.yml`.

### Duplicating skill content → local delta only (A4)

**Bad** — restates what an installed skill already covers:

> ## Commits
> Use Conventional Commits format (`feat:`, `fix:`, `chore:`, ...). Subject line under 72 chars. Include a body explaining the why. Add `Signed-off-by:` line.

**Good** — links to skill, adds only the local delta:

> ## Commits
> Use the `commit-commands:commit` skill for the standard flow.
> **Local delta:** include `Refs: bd-NNN` line when a bd issue exists for the change.

### Wall of code → file pointer + invariant (A5)

**Bad** — 50-line script pasted inline.

**Good** — pointer with the only thing a reader needs to know:

> Release: run `scripts/release.sh <version>`. The script is idempotent — safe to re-run after a failed step. Failure-mode checklist in [docs/RELEASING.md](docs/RELEASING.md).

### Stub doc → deletion

**Bad** — placeholder file kept for "structure":

> # project-foo plugin — rules & design decisions
>
> No rules or design decisions recorded yet.

**Good** — delete the file. Re-create it (with real content) only when an actual rule or decision needs to be recorded.

## Minimal validation before handoff

Before finalizing author edits:

1. Verify paths and commands referenced by the edited sections are real.
2. Confirm linked files/anchors resolve.
3. Confirm skill-backed sections describe local deltas rather than duplicating full generic flow.
