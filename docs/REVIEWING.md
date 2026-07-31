# Reviewing

Project-specific review rules for this plugin marketplace. The generic review lenses are
covered by the `project-review` skills — `project-review-codebase` (consistency,
structure, architecture and tests, as four dimensions of one review) and
`project-review-docs`. Empirical test-suite strength is measured separately by
`project-auto-work:test-tests`. This file records only the local delta. Where it
conflicts with a skill's default, this file wins.

## What to prioritise

- **Quality gates stay green.** A change must not break `bash tests/run-all.sh` or
  `mise run check-consistency` (see [TESTING.md](TESTING.md)). Flag any change that skips
  or weakens these.
- **Skill triggering.** Most skills are user-invoked (Schema A — see
  [CODING.md](CODING.md)): their `description` is human-facing and carries no
  routing. For the model-discoverable (Schema B) skills, `when_to_use` is
  load-bearing — review wording changes for trigger accuracy and overlap with
  sibling skills, not just prose quality. When a change adds or reshapes a
  Schema B skill that overlaps a sibling, the carve-out must be bidirectional —
  the sibling's `when_to_use` has to point back too, not just the new skill's.
  A one-directional exclusion still mis-routes the shared queries. Also flag a
  new skill that reaches for Schema B when Schema A (the default) would do.

## Project-specific rules

- Version bumps must stay in lockstep across the marketplace manifest and changed
  plugins (see [RELEASING.md](RELEASING.md)); flag a partial bump.
- A new canonical doc must be registered in the taxonomy reference
  (`plugins/instruction-writing/skills/writing-project-docs/references/project-setup.md`,
  plus a worked example beside it under `examples/`) **and** in `manifest.py`'s canonical
  lists (`plugins/project-review/skills/project-review-docs/scripts/`) — the standard and
  the reviewer that applies it live in different plugins, so flag a change that lands in
  only one. Otherwise the manifest classifies the doc as non-standard. That classification
  is advisory (the review's per-file agents judge placement); registering the topic is a
  human step, not an automatic gate.
- Reviews here suggest; they never edit the project or the task tracker.

## Out of scope / non-blocking

- Style-only findings are out of scope. Shell style is owned by ShellCheck
  (`mise run lint`, mirrored by the CI `shellcheck` job — see [TESTING.md](TESTING.md));
  markdown and JSON have no configured formatter, and reviews do not fill that gap by hand.
- Cross-references and version lockstep are checked by `mise run check-consistency`
  (`scripts/check-internal-consistency.py`). Route resolution, the
  `CLAUDE.md` = `@AGENTS.md` contract, and canonical inventory are reported by the docs
  manifest (`manifest.py` under `plugins/project-review/skills/project-review-docs/scripts/`,
  the deterministic layer of the `project-review-docs` audit). Lean on these rather than
  re-checking by hand what they already cover.
