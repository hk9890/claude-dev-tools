# Reviewing

Project-specific review rules for this plugin marketplace. The generic review lenses
(complexity, structure, consistency, tests, docs) are covered by the `project-review`
review skills — this file records only the local delta. Where it conflicts with a
skill's default, this file wins.

## What to prioritise

- **Quality gates stay green.** A change must not break `bash tests/run-all.sh` or
  `mise run check-consistency` (see [TESTING.md](TESTING.md)). Flag any change that skips
  or weakens these.
- **Skill triggering.** A skill's `description` and `when_to_use` frontmatter are
  load-bearing for routing. Review wording changes for trigger accuracy and overlap
  with sibling skills, not just prose quality.

## Project-specific rules

- Version bumps must stay in lockstep across the marketplace manifest and changed
  plugins (see [RELEASING.md](RELEASING.md)); flag a partial bump.
- A new canonical doc must be registered in the taxonomy reference
  (`project-setup.md`) and in `manifest.py`'s canonical lists — both under
  `plugins/project-review/skills/project-review-docs/` — otherwise the manifest
  classifies it as a non-standard doc. That classification is advisory (the review's
  per-file agents judge placement); registering the topic is a human step, not an
  automatic gate.
- Reviews here suggest; they never edit the project or the task tracker.

## Out of scope / non-blocking

- There is no configured linter (`mise run lint` is a no-op); do not raise style-only
  findings a formatter would own.
- Cross-references and version lockstep are checked by `mise run check-consistency`
  (`scripts/check-internal-consistency.py`). Route resolution, the
  `CLAUDE.md` = `@AGENTS.md` contract, and canonical inventory are reported by the docs
  manifest (`manifest.py` under `plugins/project-review/skills/project-review-docs/scripts/`,
  the deterministic layer of the `project-review-docs` audit). Lean on these rather than
  re-checking by hand what they already cover.
