# project-review

Multi-perspective adversarial review plugin — bias toward simplicity and coherence.

## Overview

This plugin provides structured, adversarial reviews across four dimensions of a project. Every skill challenges the artifact from a skeptical stance: added complexity, structural debt, test gaps, and naming/pattern divergence are guilty until proven necessary or justified.

Covers four review types:
- **Complexity review** — challenge requirements, architecture, and code for accidental complexity and unjustified abstractions
- **Structure review** — flag layering smells, boundary violations, and unclear component responsibilities; routes design verdicts to project-review-complexity
- **Test review** — adversarial test quality and coverage review; surface gaps, weak assertions, and missing edge cases
- **Consistency review** — adversarial pattern and naming divergence review; flag drift from established conventions

## Skills

| Skill | Description |
|---|---|
| `project-review-complexity` | Skeptical complexity review of requirements, architecture, or code — challenges every abstraction and dependency |
| `project-review-structure` | Adversarial review of physical project layout — misplaced files, god-files, dead code, tree-vs-docs drift; routes design verdicts to project-review-complexity |
| `project-review-test` | Adversarial test quality and coverage review — slow suites, unjustified long tests, coverage gaps, weak or unfalsifiable assertions |
| `project-review-consistency` | Adversarial pattern and naming divergence review — competing implementations, uneven naming, inconsistent API shapes |

## Usage

Invoke each skill by describing your review need — the harness routes to the appropriate skill automatically:

```
Review this architecture proposal for complexity
Is this over-engineered?
Challenge these requirements
Does this test suite have meaningful coverage?
Are the naming patterns consistent across the codebase?
```

## Review Output Structure

All four skills produce the same output skeleton, defined in the shared
`project-reviewer` agent:

1. **Verdict** — one label from the skill's domain-specific label set (see below)
2. *(Optional)* skill-specific opening sections — e.g. `Principle pressure points` in complexity
3. **Findings** — each with `Location`, `Observation`, `Why it matters`, `Recommended action`, and optional `Route to`
4. *(Optional)* skill-specific middle sections — e.g. `Open questions` in complexity
5. **Recommended actions** — prioritised list of what to tackle first

Per-skill verdict label sets:

| Skill | Verdict labels |
|---|---|
| `project-review-complexity` | `approve` / `approve with concerns` / `needs clarification` / `reject` |
| `project-review-structure` | `clean` / `minor issues` / `significant issues` / `broken` |
| `project-review-test` | `passing` / `needs work` / `unreliable` |
| `project-review-consistency` | `consistent` / `minor drift` / `significant drift` / `incoherent` |

`project-review-structure`, `project-review-test`, and `project-review-consistency` reach the
above output via interrogation-style procedures: they grill the project through a
numbered sequence of pointed questions, each with a recommended answer, and explore
the codebase before asking. See [RULES.md](RULES.md) for the division of labour
between the four skills.

## Plugin Structure

```
project-review/
├── .claude-plugin/
│   └── plugin.json
├── RULES.md
├── agents/
│   └── project-reviewer.md   (shared adversarial reviewer persona)
└── skills/
    ├── project-review-complexity/
    │   ├── SKILL.md
    │   └── references/     (principles, requirements-review, architecture-review, code-pr-review)
    ├── project-review-structure/
    │   └── SKILL.md
    ├── project-review-test/
    │   └── SKILL.md
    └── project-review-consistency/
        └── SKILL.md
```
