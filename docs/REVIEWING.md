# Reviewing

Local review rules for this plugin marketplace. The generic lenses are `project-review-codebase`, `project-review-docs`, and `project-auto-work:test-tests`; this file records only the delta, and wins where the two conflict.

## What to prioritise

- **Quality gates stay green.** Flag any change that breaks, skips, or weakens `bash tests/run-all.sh` or `mise run check-consistency` ([TESTING.md](TESTING.md)).
- **Skill triggering.** For Schema B skills, `when_to_use` is load-bearing: review wording changes for trigger accuracy, sibling overlap, and the bidirectional carve-out ([CODING.md](CODING.md)). Flag a new skill reaching for Schema B where Schema A, the default, would do.
- **A new canonical doc lands in two plugins or in neither.** The taxonomy reference (`plugins/instruction-writing/skills/writing-project-docs/references/project-setup.md`, plus a worked example beside it under `examples/`) and `manifest.py`'s canonical lists (`plugins/project-review/skills/project-review-docs/scripts/`) sit in different plugins, so flag a change landing in only one — the manifest then classifies the doc as non-standard. That classification is advisory; registering the topic is a human step, not a gate.

## Out of scope / non-blocking

- Style-only findings. Shell style belongs to ShellCheck (`mise run lint`); markdown and JSON have no configured formatter, and reviews do not fill that gap by hand.
- Anything the deterministic checkers already cover: cross-references and version lockstep (`mise run check-consistency`), and route resolution, the `CLAUDE.md` = `@AGENTS.md` contract, and canonical inventory (`manifest.py`, the deterministic layer of the `project-review-docs` audit). Lean on them rather than re-checking by hand.
