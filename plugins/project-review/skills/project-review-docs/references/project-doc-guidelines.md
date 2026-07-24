# Project-Doc Authoring Guidelines

Authoring standard for canonical project docs.

Use with:

- [project-setup.md](project-setup.md)
- [project-doc-review-guidelines.md](project-doc-review-guidelines.md)

## Authoring objectives

1. Keep docs actionable for this repository.
2. Keep docs compact enough for selective loading (A11).
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

Structure a reader can skim (length itself is A11):

- explicit headings
- one idea per bullet
- links over duplicated background

### A6 — Canonical change-landing placement

Change-landing guidance belongs in `CHANGE-WORKFLOW.md`.

### A7 — No duplication of AGENTS.md content

`AGENTS.md` is the single routing surface: canonical `docs/` files MUST NOT re-list the
files, directories, docs, or skills it routes to, nor restate its project summary or
routing table — link to it instead. Binds `docs/OVERVIEW.md` in particular (describe
structure and domain, not the routes `AGENTS.md` already declares).

### A8 — Canonical review-guidance placement

Project-specific review guidance (priorities, must-check rules, out-of-scope conventions)
belongs in `REVIEWING.md`, not scattered into `CODING.md`/`CHANGE-WORKFLOW.md`. Like A4,
state only the local delta and link the `project-review-*` skills, not a generic checklist.

### A9 — Canonical product-operation placement

How-to-operate-the-product guidance (launch the built artifact and drive it by hand to
reproduce a bug or verify a fix) belongs in `RUNNING.md`, not `TESTING.md` (automated
suites) or `MONITORING.md` (log/usage analysis). Like A4, state only the local delta and
link the `run`/`verify` skills.

### A10 — Audience/purpose fit

Write content into the file whose **audience** it serves, not merely one where the
statement is true. Misplaced content is a finding even when every statement is accurate —
distinct from A3 (the *topic* axis): two files can share a topic yet differ by audience
(`CODING.md` for the agent, `CONTRIBUTING.md` for a human). Each file's audience and
*Inside* / *Not inside* boundary is fixed in [project-setup.md](project-setup.md)
(**File ownership boundaries**); enforced on the review side by R10.

### A11 — Economy

Write for an agent reading under load: each section as short as its content allows, in the
register of a command reference rather than narrative prose. A file spending more words than
its content earns is a finding on its own, independent of accuracy — as is a hollow section
kept for symmetry, or review-commentary and TODOs left in the body.

An economy finding cites the specific spans it would cut, so the recommendation is
falsifiable rather than a verdict on the file's feel. Severity tracks what the bloat costs a
reader: a file whose length actively obscures the procedure it documents is `major`, not a
housekeeping note.

## Hard prohibitions

Canonical docs should avoid:

- generic advice without local anchors
- large pasted code blocks when a file pointer is enough
- **auto-injected blocks** from external tools in `CLAUDE.md` or `AGENTS.md` — these files are hand-authored steering surfaces. Markers like `<!-- BEGIN <TOOL> -->` ... `<!-- END <TOOL> -->` belong in topic-specific docs under `docs/` (or, if the tool's content is truly transient/personal, in `.claude.local.md`). Detected by `scripts/manifest.py` (`injected_blocks`).
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
> **Local delta:** include `Refs: <task-id>` line when a taskmgr task exists for the change.

### Wall of code → file pointer + invariant (A5/A11)

**Bad** — 50-line script pasted inline.

**Good** — pointer with the only thing a reader needs to know:

> Release: run `scripts/release.sh <version>`. The script is idempotent — safe to re-run after a failed step. Failure-mode checklist in `[docs/RELEASING.md](docs/RELEASING.md)`.

### Stub doc → deletion

**Bad** — placeholder file kept for "structure":

> # project-foo plugin — rules & design decisions
>
> No rules or design decisions recorded yet.

**Good** — delete the file. Re-create it (with real content) only when an actual rule or decision needs to be recorded.

## What a good fix looks like

A suggested fix should clear this bar before you recommend it (the auditor proposes, it never finalizes edits):

1. Paths and commands referenced by the suggested fix are real.
2. Linked files/anchors in the suggested fix resolve.
3. Skill-backed sections in the suggested fix describe local deltas rather than duplicating full generic flow.
4. The fix is an **edit, not an append** — it names what the new text replaces, or states why
   nothing is superseded. Rounds of pure addition are each locally reasonable and leave the
   doc set permanently longer.
