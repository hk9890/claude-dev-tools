# Reviewing

Project-specific review rules for this plugin marketplace. The generic review lenses
(complexity, structure, consistency, tests, docs) are covered by the `project-quality`
review skills — this file records only the local delta. Where it conflicts with a
skill's default, this file wins.

## What to prioritise

- **Quality gates stay green.** A change must not break `bash tests/run-all.sh` or
  `make check-consistency` (see [TESTING.md](TESTING.md)). Flag any change that skips
  or weakens these.
- **Design-decision conformance.** Changes under `plugins/project-quality/` must obey
  its `RULES.md` (the three-family split, the `project-<verb>-<topic>` naming shape,
  the read-only review contract). A violation of a recorded design decision is blocking.
- **Skill triggering.** A skill's `description` and `when_to_use` frontmatter are
  load-bearing for routing. Review wording changes for trigger accuracy and overlap
  with sibling skills, not just prose quality.

## Project-specific rules

- Version bumps must stay in lockstep across the marketplace manifest and changed
  plugins (see [RELEASING.md](RELEASING.md)); flag a partial bump.
- A new canonical doc must be registered in the taxonomy reference
  (`project-setup.md`) and recognized by the `inventory.py` validator — both under
  `plugins/project-quality/skills/project-review-docs/` — so it is not flagged as a
  stray, non-canonical file.
- Reviews here suggest; they never edit the project or the task tracker.

## Out of scope / non-blocking

- There is no configured linter (`make lint` is a no-op); do not raise style-only
  findings a formatter would own.
- Cross-references and version lockstep are checked by `make check-consistency`
  (`scripts/check-internal-consistency.py`). Route resolution, the
  `CLAUDE.md` = `@AGENTS.md` contract, and canonical inventory are checked by the docs
  validator (`verify.sh` under `plugins/project-quality/skills/project-review-docs/scripts/`),
  run on doc changes per the pre-push checklist in [CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md).
  Lean on these rather than re-checking by hand what they already cover.
