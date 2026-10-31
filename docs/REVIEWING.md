# Reviewing

Local review rules for this plugin marketplace. The generic lenses are `project-review-change`, `project-review-codebase`, `project-review-docs`, and `project-auto-work:test-tests`; this file records only the delta, and wins where the two conflict.

## What to prioritise

- **Quality gates stay green.** Flag any change that breaks, skips, or weakens `bash tests/run-all.sh` or `mise run check-consistency` ([TESTING.md](TESTING.md)).
- **Skill triggering.** For Schema B skills, `when_to_use` is load-bearing: review wording changes for trigger accuracy, sibling overlap, and the bidirectional carve-out ([CODING.md](CODING.md)). Flag a new skill reaching for Schema B where Schema A, the default, would do.
- **A new canonical doc lands in three plugins or in none.** Flag a change that skips a step of [Adding a canonical doc](CODING.md#adding-a-canonical-doc), most of all the example route and the `project-exec-init` row, which no test checks.

## Quality rules

How a finished change must look. Each is a condition to check on the diff.

- **Skill and agent text.** A changed `SKILL.md`, a file it bundles or shares, or a file under a plugin's `agents/` meets the `instruction-writing:writing-skills` rubric. Call the Skill tool with `instruction-writing:writing-skills` and the changed paths, even where it loaded earlier in this session, and apply every rule of it and of the `writing-hygiene.md` it points to; reading the file is not loading the skill. Then run `plugin-dev:skill-reviewer` on each changed `SKILL.md`; each point it raises that the rubric backs is a finding:

  ```
  Review the skill at plugins/my-plugin/skills/my-skill/SKILL.md
  ```

  It is an aid, not a gate: only `plugin-dev:plugin-validator` blocks a PR ([CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md)). The rubric binds the lines the change wrote: a defect on an older line of the same file is a non-blocking suggestion.
- **`argument-hint` shape.** The hint names the shape in a short bracketed placeholder, because the slash-command picker truncates anything longer, and spells out an enum-valued argument: `[low|medium|high|ultra]`, not `[level]`.
- **Skill prefix.** A new or renamed skill shares its siblings' prefix, or its plugin is the exception ([CODING.md](CODING.md#naming)).
- **Minimum version of a mod.** The `README.md` row of a mod says "needs Claude Code 2.1.287+".

## Out of scope / non-blocking

- Style-only findings. Shell style belongs to ShellCheck (`mise run lint`); markdown and JSON have no configured formatter, and reviews do not fill that gap by hand.
- Anything the deterministic checkers already cover: cross-references and version lockstep (`mise run check-consistency`), and route resolution, the `CLAUDE.md` = `@AGENTS.md` contract, and canonical inventory (`manifest.py`, the deterministic layer of the `project-review-docs` audit). Lean on them rather than re-checking by hand.
