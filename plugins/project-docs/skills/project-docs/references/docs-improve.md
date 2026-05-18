# Improve Docs Structure and Quality

Primary entrypoint for the **improve docs** flow.

Use this when the docs need better structure, taxonomy clarity, consolidation, split/merge/slim adjustments, or routing quality improvements.

## Flow contract

- Focus on structure/quality, not only factual correction.
- Require evidence before merge/split/delete decisions.
- Ask for explicit confirmation before aggressive removals or consolidations.

## Required references

- Canonical doc set + ownership baseline: [project-setup.md](project-setup.md)
- Structural constraints: [project-structure.md](project-structure.md)
- Authoring standards: [project-doc-guidelines.md](project-doc-guidelines.md)
- Shared lifecycle procedures: [project-docs-lifecycle.md](project-docs-lifecycle.md)

## Improve workflow

1. Inspect current structure and classify issues (overlap, noise, missing routes, hollow docs, wrong destination).
2. Produce proposed structural changes (split/merge/slim/consolidate/retire) with rationale.
3. Request confirmation for high-impact changes.
4. Apply selected structural edits and route fixes.
5. Refresh AGENTS routing if structural paths changed.
6. Run lifecycle verification checks and confirm no stale routes remain.

## Execution modes

### Discussion-first mode

Use when user asks for proposals first.

1. Summarize strengths, gaps, and options.
2. Ask which options to apply.
3. Implement selected options with verification.

### Incident-driven mode

Use when a concrete docs failure/incident is provided.

1. Capture incident context and prevention gap.
2. Propose recurrence-prevention structural edits.
3. Confirm high-impact changes, then implement and verify.

## Output requirements

Report:

- selected mode (discussion-first or incident-driven)
- structural changes proposed/applied, each shown using the [per-edit format](#per-edit-format) below
- confirmations requested/received for aggressive changes
- verification results and remaining follow-ups

## Per-edit format

Every proposed structural change (split/merge/slim/consolidate/retire/route-fix) must be presented as:

```
### <Verb>: <file>:<section>
**Why:** <one-line — what structural problem this fixes>

```diff
<minimal diff>
```
```

Rationale: the `**Why:**` line forces each structural change to justify itself against your authoring rules, preventing churn that doesn't earn its place.
