---
name: coder-docs
description: "Use this skill whenever the user wants to create, refresh, review, reorganize, audit, slim, standardize, or fix project documentation; define canonical docs taxonomy; update AGENTS.md routing; or clean up stale, confusing, misrouted, or hollow docs. Trigger even when the user says things like 'our docs are messy,' 'does AGENTS still match the repo?,' 'help standardize the docs,' or 'review the docs before changing anything.'"
---

## Standalone workflow contract

Use this skill for project-doc creation, update, improvement, and review.

Scope:

- establish canonical project-doc taxonomy and file ownership boundaries
- create or update project docs when the repository has real local guidance
- improve docs structure and quality (split/merge/slim/consolidate) with explicit confirmation for aggressive changes
- review docs for stale, duplicate, confusing, or misrouted guidance
- keep AGENTS routing aligned with canonical docs and installed skills

## Workflow routing

| Primary flow | Use when | Primary entrypoint |
|---|---|---|
| 1) Create project docs | Baseline is missing or needs first-time setup | [references/docs-init.md](references/docs-init.md) |
| 2) Update docs to match project truth | Docs exist but are stale/inaccurate and should be corrected without changing source code | [references/docs-update.md](references/docs-update.md) |
| 3) Improve docs structure/quality | Taxonomy, structure, clarity, split/merge/slim/consolidation quality needs improvement | [references/docs-improve.md](references/docs-improve.md) |
| 4) Review/validate without editing | User wants findings only before any edits | [references/project-doc-review-guidelines.md](references/project-doc-review-guidelines.md) |

Supporting references:

- Setup/taxonomy ownership baseline: [references/project-setup.md](references/project-setup.md)
- Mode/path and structural constraints: [references/project-structure.md](references/project-structure.md)
- Shared deep lifecycle procedures: [references/project-docs-lifecycle.md](references/project-docs-lifecycle.md)
- Authoring standards: [references/project-doc-guidelines.md](references/project-doc-guidelines.md)
- AGENTS specialized route (secondary unless explicitly requested): [references/agents-md-template.md](references/agents-md-template.md)

## Decision rules

- Route to exactly one primary flow first (create, update, improve, or review), then load supporting references as needed.
- If the user wants findings before edits, use the review flow and keep the session read-only.
- If the user wants factual correction of existing docs, use the update flow and keep edits docs-only.
- If the user wants structural quality changes, use the improve flow.
- Ask before aggressive removals, merges, splits, or consolidations.
- Keep `AGENTS.md` as a routing surface, not a handbook.
- Route change-landing guidance to `CHANGE-WORKFLOW.md`.
- Create topic docs only when the repository has real local guidance for that topic.
- If a topic is fully covered by an installed skill and there is no local delta, route to the skill instead of creating a hollow doc.
- Use AGENTS-only guidance as a specialized secondary path unless the user explicitly asks for AGENTS-only work.

## Response contract

- For create flow, report baseline decisions, mode/path resolution, created files, skipped files with reasons, and verification output.
- For update flow, explicitly state docs-only scope and no source-file edits, then report what was corrected and how claims were verified.
- For improve flow, report proposed/selected structural improvements, requested confirmations, and post-change verification.
- For review flow, explicitly state read-only behavior and return findings with severity, evidence, and suggested fixes.
- For AGENTS guidance, keep output concise and routing-oriented; do not inline full procedures that belong in docs or skills.

## Runtime routing guardrails

Use `coder-docs` for docs lifecycle work (create, update, improve, review) and AGENTS routing alignment.

If the request is primarily about non-doc workflows, route directly:

- external tracker synchronization (GitHub/Jira) → task-sync skill if installed
