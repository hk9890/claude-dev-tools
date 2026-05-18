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

1. Run `scripts/inventory.py <repo-root>` to enumerate canonical docs (`CLAUDE.md`, `AGENTS.md`, `docs/`), non-canonical `docs/*.md` files, non-canonical subdirs under `docs/`, and location violations as structured JSON.
2. Classify topics as:
   - doc-backed
   - skill-only
   - neither
3. Identify consolidation candidates from the `non_canonical_docs` and `non_canonical_subdirs` lists.

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

Use [agents-md-template.md](agents-md-template.md) for structural constraints.

- Regenerate or update AGENTS routes from inspected state.
- Preserve custom sections unless obsolete.
- Verify `CLAUDE.md` is exactly `@AGENTS.md` (one line, optional trailing newline). If extra content is present, run the [CLAUDE migration step](docs-init.md#claude-migration-step) before continuing.

## Phase 7 — Verify/report (mandatory)

Run `scripts/verify.sh <repo-root>` — it implements checks 1, 2, 4, 5, 6 automatically. Checks 3 and 7 remain agent-only.

What each check covers:

1. Referenced paths exist. *(automated by verify.sh)*
2. AGENTS routes resolve to real docs/skills. *(automated by verify.sh)*
3. Skill-only topics do not create hollow docs. *(agent-only)*
4. `CLAUDE.md` is exactly `@AGENTS.md` (one line). Extra content is a hard failure. *(automated by verify.sh → claude-md.sh check)*
5. Links/anchors resolve for lifecycle-touched docs. *(automated by verify.sh)*
6. No stale references remain. *(automated by verify.sh)*
7. If canonical docs changed, Phase 3.5 loop completed blocker-free. *(agent-only)*

Final report should include:

- phases executed
- created/updated/skipped docs with reasons
- verification outcome and unresolved follow-ups

For improve-doc execution modes (discussion-first and incident-driven), see [docs-improve.md](docs-improve.md).
