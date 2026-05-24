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

## 3. project-review-complexity keeps its verdict-report format

`project-review-complexity` retains its structured verdict-report output (Verdict /
Principle pressure points / Findings / Open questions / What to remove or defer /
What is justified). It is NOT converted to an interrogation-style or
question-first workflow. The verdict-first format is intentional — it commits the
reviewer to a stance and forces justification rather than deferring judgment.

## 4. Reviewer skills run forked and share one persona agent

Each reviewer skill runs in a forked context (`context: fork`) and delegates to a
single shared agent, `agents/project-reviewer.md`. That agent encodes only the
*attitude* common to every review — the read-only contract, explore-before-judging,
the recommended-answer rule, the adversarial disposition, directness, and
evidence-citing. It encodes no review *procedure* and no *output format*.

Each `SKILL.md` keeps its own procedure and output format and supplies them to the
forked agent: project-review-complexity its verdict report; project-review-structure, project-review-test,
and project-review-consistency their interrogation procedures. The shared agent must never
impose one shape on another — see rule 3.

This supersedes the earlier rule that forbade any shared file across reviewers.
The risk that rule named — a shared file silently altering every reviewer — is now
accepted deliberately and narrowly: the four reviewers genuinely share one
disposition, and stating it once keeps them from drifting apart. Only the
*attitude* is shared. Procedure, principles, and output format stay per-skill;
there is still no shared file for those, and no `skills/_shared/` directory.

All four reviewer skills follow this pattern.
