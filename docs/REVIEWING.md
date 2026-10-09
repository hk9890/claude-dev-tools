# Reviewing

Local review rules for this plugin marketplace. The generic lenses are `project-review-change`, `project-review-codebase`, `project-review-docs`, and `project-auto-work:test-tests`; this file records only the delta, and wins where the two conflict.

## What to prioritise

- **Quality gates stay green.** Flag any change that breaks, skips, or weakens `bash tests/run-all.sh` or `mise run check-consistency` ([TESTING.md](TESTING.md)).
- **Skill triggering.** For Schema B skills, `when_to_use` is load-bearing: review wording changes for trigger accuracy, sibling overlap, and the bidirectional carve-out ([CODING.md](CODING.md)). Flag a new skill reaching for Schema B where Schema A, the default, would do.
- **A new canonical doc lands in three plugins or in none.** The taxonomy is `instruction-writing` (`writing-project-docs/references/project-setup.md`, plus a worked example under `examples/docs/`); the reviewer's copy is `project-review` (`manifest.py`'s canonical lists, and the use-case maps in `history.py` and `workflows/review-docs.js`); the earned-topic table is `project-execute` (`project-exec-init/SKILL.md`). `tests/marketplace/script-tests/test-canonical-docs.sh` gates the first two. Nothing checks the exec-init row, so flag a change that leaves it behind — `/project-exec-init` then never writes the doc.

## Quality rules

How a finished change must look. Each is a condition to check on the diff.

- **`SKILL.md` quality.** A changed `SKILL.md` meets the rubric in [`plugins/instruction-writing/skills/writing-skills/SKILL.md`](../plugins/instruction-writing/skills/writing-skills/SKILL.md). Run `plugin-dev:skill-reviewer` on it; each point it raises that the rubric backs is a finding:

  ```
  Review the skill at plugins/my-plugin/skills/my-skill/SKILL.md
  ```

  It is an aid, not a gate: only `plugin-dev:plugin-validator` blocks a PR ([CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md)). The rubric binds the lines the change wrote: a defect on an older line of the same file is a non-blocking suggestion.
- **`argument-hint` shape.** The hint names the shape in a short bracketed placeholder, because the slash-command picker truncates anything longer, and spells out an enum-valued argument: `[low|medium|high|ultra]`, not `[level]`.
- **Minimum version of a mod.** The `README.md` row of a mod says "needs Claude Code 2.1.287+".

## Out of scope / non-blocking

- Style-only findings. Shell style belongs to ShellCheck (`mise run lint`); markdown and JSON have no configured formatter, and reviews do not fill that gap by hand.
- Anything the deterministic checkers already cover: cross-references and version lockstep (`mise run check-consistency`), and route resolution, the `CLAUDE.md` = `@AGENTS.md` contract, and canonical inventory (`manifest.py`, the deterministic layer of the `project-review-docs` audit). Lean on them rather than re-checking by hand.
