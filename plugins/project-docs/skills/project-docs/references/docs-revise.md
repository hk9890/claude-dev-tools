# Revise Docs — Capture Session Learnings

Primary entrypoint for the **revise docs** flow.

Use this at the end of a session to capture learnings about working with this repo into the canonical docs (and AGENTS routing).

## Flow contract

- Goal: route session-discovered learnings into the correct canonical doc or AGENTS routing entry.
- Scope: docs-only — canonical `docs/*.md` files and `AGENTS.md`. Never `CLAUDE.md` (which only holds `@AGENTS.md`).
- Never writes to `.claude.local.md` (personal-local; the user edits that file directly).
- Per-addition approval required.
- May create a missing canonical doc on the fly when a substantive learning warrants it.

## Required references

- Canonical doc set + ownership boundaries: [project-setup.md](project-setup.md)
- Authoring standards: [project-doc-guidelines.md](project-doc-guidelines.md)
- Routing template (for AGENTS.md additions): [agents-md-template.md](agents-md-template.md)
- Lifecycle verification: [project-docs-lifecycle.md](project-docs-lifecycle.md)

## Revise workflow

### 1. Reflect

Identify what would have helped Claude work more effectively in this session.

Keep:

- commands or workflows discovered/confirmed
- gotchas, ordering dependencies, non-obvious patterns
- testing approaches that worked
- environment/configuration quirks
- a skill that should be wired into AGENTS routing for a use case
- corrections to existing docs surfaced by actual work

Skip:

- one-off fixes unlikely to recur
- restatements of obvious code
- generic best practices not specific to this repo
- personal preferences — those belong in `.claude.local.md`, edited by the user directly

### 2. Map each learning to a destination

| Learning type | Destination |
|---|---|
| Architecture/domain insight | `docs/OVERVIEW.md` |
| Implementation rule/pattern | `docs/CODING.md` |
| Test command/policy | `docs/TESTING.md` |
| Release constraint | `docs/RELEASING.md` |
| Observability/evidence path | `docs/MONITORING.md` |
| Commit/branch/PR rule | `docs/CHANGE-WORKFLOW.md` |
| New use-case routing | `AGENTS.md` (new `###` section) |
| Personal preference | (skip — user edits `.claude.local.md` directly) |

### 3. Handle missing canonical docs

If a learning fits a canonical doc that doesn't exist yet:

1. Check the learning is substantive — at least 2–3 concrete items, not a single bullet.
2. If yes: offer to create the doc inline with the learning as initial content. Ask for explicit confirmation before creating; use the topic's role from [project-setup.md](project-setup.md) to scope the new file.
3. If no: skip the learning and suggest the user run `/project-docs:create-docs` if they want the topic doc set up.
4. After creation, refresh AGENTS routing to include the new doc.

### 4. Present each addition

Use the per-edit format below. Get per-addition approval before writing.

### 5. Apply

Apply approved edits docs-only. Never edit source code, configs, tracker state, `CLAUDE.md`, or `.claude.local.md`.

### 6. Verify

Run `scripts/verify.sh <repo-root>` to confirm no broken routes or stale references after edits.

## Per-edit format

Every proposed addition must be presented as:

```
### Add: <file>:<section>
**Why:** <one-line — what gap this closes; cite the session moment that surfaced it>

```diff
<minimal addition>
```
```

Rationale: the `**Why:**` line forces the model to justify each addition (preventing drift) and gives the reviewer a quick accept/reject signal.

## Output requirements

Report:

- explicit statement that scope stayed docs-only with no source-file, `CLAUDE.md`, or `.claude.local.md` edits
- additions applied (each in per-edit format)
- additions proposed but declined
- canonical docs created on the fly (with reason)
- AGENTS routing updates
- verification results
