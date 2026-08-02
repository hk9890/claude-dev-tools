# Reviewing

Project-specific review rules for this plugin marketplace. The generic lenses are
`project-review-codebase`, `project-review-docs`, and `project-auto-work:test-tests`.
This file records only the local delta; where it conflicts with a skill's default, this
file wins.

## What to prioritise

- **Quality gates stay green.** A change must not break `bash tests/run-all.sh` or
  `mise run check-consistency` (see [TESTING.md](TESTING.md)). Flag any change that skips
  or weakens these.
- **Skill triggering.** For Schema B skills, `when_to_use` is load-bearing: review wording
  changes for trigger accuracy, sibling overlap, and the bidirectional carve-out — rules in
  [CODING.md](CODING.md). Also flag a new skill that reaches for Schema B when Schema A (the
  default) would do.

## Project-specific rules

- A new canonical doc must be registered in the taxonomy reference
  (`plugins/instruction-writing/skills/writing-project-docs/references/project-setup.md`,
  plus a worked example beside it under `examples/`) **and** in `manifest.py`'s canonical
  lists (`plugins/project-review/skills/project-review-docs/scripts/`) — the standard and
  the reviewer that applies it live in different plugins, so flag a change that lands in
  only one. Otherwise the manifest classifies the doc as non-standard. That classification
  is advisory (the review's per-file agents judge placement); registering the topic is a
  human step, not an automatic gate.
- Reviews never touch the task tracker.

## Out of scope / non-blocking

- Style-only findings are out of scope. Shell style is owned by ShellCheck (`mise run lint`,
  mirrored by the CI `shellcheck` job); markdown and JSON have no configured formatter, and
  reviews do not fill that gap by hand.
- Cross-references and version lockstep are checked by `mise run check-consistency`
  (`scripts/check-internal-consistency.py`). Route resolution, the
  `CLAUDE.md` = `@AGENTS.md` contract, and canonical inventory are reported by the docs
  manifest (`manifest.py` under `plugins/project-review/skills/project-review-docs/scripts/`,
  the deterministic layer of the `project-review-docs` audit). Lean on these rather than
  re-checking by hand what they already cover.
