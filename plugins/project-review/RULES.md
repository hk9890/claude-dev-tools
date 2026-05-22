# project-review — Design Decisions

Non-derivable design decisions and constraints for this plugin. Read before making changes.

## 1. Skills-only — no commands

The `/complexity-review` slash command was deliberately dropped when the plugin was
renamed. The `complexity-review` skill is model-invocable (via its `description`
field) and user-invocable by natural language — a command wrapper adds no value and
creates a second invocation path to maintain. New reviewer skills follow the same
pattern: skills only, no commands.

## 2. Four-skill division of labour and hand-off rules

The plugin is organised around four independent reviewer skills:

| Skill | Domain |
|---|---|
| `complexity-review` | Requirements, architecture, and code — accidental complexity and unjustified abstractions |
| `structure-review` | Layering smells, boundary violations, and component responsibility |
| `test-review` | Test quality and coverage — gaps, weak assertions, missing edge cases |
| `consistency-review` | Pattern and naming divergence — drift from established conventions |

Hand-off rule: `structure-review` flags layering smells and unclear boundaries, but
routes design-level verdicts (is the abstraction worth having?) to `complexity-review`.
Structure-review does not duplicate the complexity verdict.

## 3. complexity-review keeps its verdict-report format

`complexity-review` retains its structured verdict-report output (Verdict /
Principle pressure points / Findings / Open questions / What to remove or defer /
What is justified). It is NOT converted to an interrogation-style or
question-first workflow. The verdict-first format is intentional — it commits the
reviewer to a stance and forces justification rather than deferring judgment.

## 4. Each reviewer skill is self-contained — no shared reference file

Every new reviewer skill inlines its adversarial stance, principles, and review
protocol directly in its own `SKILL.md` and `references/` files. There is no
`skills/_shared/` directory and no shared principles file that spans skills. This
avoids invisible coupling between skills: changing the shared file would silently
alter every reviewer, and the four reviewers have distinct enough stances that
sharing would water them down.
