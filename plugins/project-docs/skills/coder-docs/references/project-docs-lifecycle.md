# Project-Docs Lifecycle

Shared deep lifecycle logic for docs create/update/improve flows.

This reference is supporting logic, not the top-level intent router.

Primary flow entrypoints:

- create flow: [docs-init.md](docs-init.md)
- update flow: [docs-update.md](docs-update.md)
- improve flow: [docs-improve.md](docs-improve.md)
- review flow (read-only): [project-doc-review-guidelines.md](project-doc-review-guidelines.md)

Use this file for lifecycle phases, deep procedures, and verification standards reused by those entrypoints.

## Input contract

- Optional free-text arguments may be used as focus weighting.
- Focus text does not permit skipping mandatory lifecycle checks.

## Lifecycle phases

## Phase 1 — Inspect

1. Detect active doc paths and AGENTS location via [project-structure.md](project-structure.md).
2. Inventory canonical docs and non-standard docs.
3. Classify topics as:
   - doc-backed
   - skill-only
   - neither
4. Identify consolidation candidates.

For change-landing guidance, treat `CHANGE-WORKFLOW.md` as canonical destination.

## Phase 1.5 — Consolidate non-standard docs (required when present)

For each candidate, gather evidence:

- topic fit
- overlap with canonical docs
- overlap with installed skills
- current operational value
- durability

Decision outcomes:

- keep (justified)
- merge
- split
- delete

Default compatibility policy: do not create redirect files for steering docs unless explicitly requested.

## Phase 2 — Bootstrap/setup

Use when lifecycle baseline is missing.

- Create minimal canonical docs only for real local guidance.
- Skip hollow docs for skill-only topics.
- Continue into AGENTS routing refresh.

## Phase 3 — Refresh/update

Use when baseline exists.

- Refresh in place.
- Preserve useful project-specific sections.
- Apply consolidation outcomes before declaring refresh done.

## Phase 3.5 — Authoring review loop (required when canonical docs change)

Repeat until no blocker findings:

1. Draft/update
2. Reviewer pass (rules + checklist)
3. Factual verification pass
4. Fix pass

Reviewer and verifier output should remain actionable and evidence-backed.

## Phase 4 — Audit/repair

- Repair stale paths/routes.
- Remove conflicting duplicate guidance.
- Ensure AGENTS routes match real docs/skills.

## Phase 5 — Slim/split

- Detect oversized/noisy docs.
- Propose targeted slimming or splitting.
- Keep routing concise and pointer-based.

## Phase 6 — AGENTS refresh

Use [agents-md-template.md](agents-md-template.md) for template constraints.

- Regenerate or update AGENTS routes from inspected state.
- Keep mode-correct path for AGENTS file.
- Preserve custom sections unless obsolete.

## Phase 7 — Verify/report (mandatory)

Before completion verify:

1. Referenced paths exist.
2. AGENTS routes resolve to real docs/skills.
3. Skill-only topics do not create hollow docs.
4. Mode/path rules are consistent.
5. Links/anchors resolve for lifecycle-touched docs.
6. No stale references remain.
7. If canonical docs changed, Phase 3.5 loop completed blocker-free.

Final report should include:

- active mode/paths
- phases executed
- created/updated/skipped docs with reasons
- verification outcome and unresolved follow-ups

## Improve-doc execution modes

### Discussion-first mode (default without strong incident context)

1. Analyze current structure.
2. Propose improvements.
3. Ask user which proposals to apply.
4. Require explicit confirmation before aggressive removals/consolidations.
5. Execute selected improvements with lifecycle consistency.

### Incident-driven mode

Use when a failure shows missing/unclear/stale guidance.

1. Capture incident context.
2. Map destination(s): project docs, AGENTS, or both.
3. Identify prevention gap.
4. Propose recurrence-prevention edits.
5. Confirm high-impact changes.
6. Apply updates and run verification loop.
