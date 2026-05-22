# Subagent Conventions

Shared conventions for tasker, reviewer, and verifier.

## Tracker comment format

Keep proposed comments short and decision-oriented:
- Capture status, outcome or finding, artifact path(s), and next step
- One finding or decision per comment
- If a finding requires substantial new analysis or separate follow-up work, return a dedicated bug/task draft instead of a long comment
- Comments accept `-f <file>` (and `bd comment ... --stdin` via the shorthand); they have no `--body`/`--body-file` flag — those belong to `bd create`

## Bug draft required fields

When returning a bug draft to the caller:

- **title** — short, descriptive
- **priority** — P0–P4 (numeric)
- **where discovered** — task/epic/file context
- **expected vs actual** — what should happen vs what does happen
- **minimal repro** — smallest reproduction steps
- **impact** — who/what is affected

## Ticket readiness checklist

Before acting on a ticket, verify it is ready:

1. **No orphaned comments** — if any comment contains decisions, scope changes, or clarifications NOT reflected in the description, the ticket is stale
2. **No open questions** — no `has:open-questions` or `needs:discussion` label; no unresolved questions in description or comments
3. **Testable success criteria** — every task, bug, and epic must state how success will be verified: a concrete command, observation, or check. "Works", "is done", or "looks correct" are not acceptable.
4. **Actionable instructions** — a tasker should be able to execute without guessing

If any check fails: do NOT proceed — report back to the caller with the exact issues found and tracker-ready comment text.
