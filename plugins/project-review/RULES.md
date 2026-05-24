# project-review — Design Decisions

Non-derivable design decisions and constraints for this plugin. Read before making changes.

## 1. Skills-only — no commands

The `/complexity-review` slash command was deliberately dropped when the plugin was
renamed (now `project-review-complexity`). The `project-review-complexity` skill is model-invocable (via its `description`
field) and user-invocable by natural language — a command wrapper adds no value and
creates a second invocation path to maintain. New reviewer skills follow the same
pattern: skills only, no commands.

## 2. Four-skill division of labour and hand-off rules

The plugin is organised around four independent reviewer skills:

| Skill | Domain |
|---|---|
| `project-review-complexity` | Requirements, architecture, and code — accidental complexity and unjustified abstractions |
| `project-review-structure` | Layering smells, boundary violations, and component responsibility |
| `project-review-test` | Test quality and coverage — gaps, weak assertions, missing edge cases |
| `project-review-consistency` | Pattern and naming divergence — drift from established conventions |

Hand-off rule: `project-review-structure` flags layering smells and unclear boundaries, but
routes design-level verdicts (is the abstraction worth having?) to `project-review-complexity`.
Structure-review does not duplicate the complexity verdict.

## 3. project-review-complexity is not converted to an interrogation procedure

The other three skills (`structure`, `test`, `consistency`) use interrogation-style
procedures — numbered sequences of questions with recommended answers. The
`complexity` skill deliberately does NOT. Its procedure is verdict-first: pick
one of `approve` / `approve with concerns` / `needs clarification` / `reject` and
defend it. The verdict-first procedure is intentional — it commits the reviewer to
a stance and forces justification rather than deferring judgment behind a
question list.

This is a constraint on the *procedure*, not on the *output format* — see rule 4
for the shared output skeleton that every skill (including complexity) conforms to.

## 4. Reviewer skills run forked and share one persona agent

Each reviewer skill runs in a forked context (`context: fork`) and delegates to a
single shared agent, `agents/project-reviewer.md`. That agent encodes:

- the *attitude* common to every review — the read-only contract,
  explore-before-judging, the recommended-answer rule, the adversarial
  disposition, directness, and evidence-citing;
- the *output skeleton* every review must conform to — Verdict, Findings (with a
  fixed 5-field schema), and a prioritised Recommended actions list.

Each `SKILL.md` keeps its own *procedure*, its own *verdict label set*, and any
*optional opening or middle sections* (e.g. complexity's `Principle pressure
points` and `Open questions`). The skill may extend the agent's skeleton; it may
not drop, rename, or reshape the mandatory sections.

This supersedes the earlier rule that forbade any shared file across reviewers.
The risk that rule named — a shared file silently altering every reviewer — is now
accepted deliberately and narrowly: the four reviewers genuinely share one
disposition and one report shape, and stating each once keeps them from drifting
apart. Procedure, principles, and verdict label sets stay per-skill; there is
still no shared file for those, and no `skills/_shared/` directory.

All four reviewer skills follow this pattern.
