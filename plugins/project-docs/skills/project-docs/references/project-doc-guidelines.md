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

## Hard prohibitions

Canonical docs should avoid:

- generic advice without local anchors
- large pasted code blocks when a file pointer is enough

## Minimal validation before handoff

Before finalizing author edits:

1. Verify paths and commands referenced by the edited sections are real.
2. Confirm linked files/anchors resolve.
3. Confirm skill-backed sections describe local deltas rather than duplicating full generic flow.
