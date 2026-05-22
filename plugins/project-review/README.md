# project-review

Multi-perspective adversarial review plugin — bias toward simplicity and coherence.

## Overview

This plugin provides structured, adversarial reviews across four dimensions of a project. Every skill challenges the artifact from a skeptical stance: added complexity, structural debt, test gaps, and naming/pattern divergence are guilty until proven necessary or justified.

Covers four review types:
- **Complexity review** — challenge requirements, architecture, and code for accidental complexity and unjustified abstractions
- **Structure review** — flag layering smells, boundary violations, and unclear component responsibilities; routes design verdicts to complexity-review
- **Test review** — adversarial test quality and coverage review; surface gaps, weak assertions, and missing edge cases
- **Consistency review** — adversarial pattern and naming divergence review; flag drift from established conventions

## Skills

| Skill | Description |
|---|---|
| `complexity-review` | Skeptical complexity review of requirements, architecture, or code — challenges every abstraction and dependency |
| `structure-review` | Adversarial review of physical project layout — misplaced files, god-files, dead code, tree-vs-docs drift; routes design verdicts to complexity-review |
| `test-review` | Adversarial test quality and coverage review — slow suites, unjustified long tests, coverage gaps, weak or unfalsifiable assertions |
| `consistency-review` | Adversarial pattern and naming divergence review — competing implementations, uneven naming, inconsistent API shapes |

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

`complexity-review` produces a structured verdict report:

1. **Verdict** — approve / approve with concerns / needs clarification / reject
2. **Principle pressure points** — which principles are most at stake
3. **Findings** — observation, why it matters, simpler alternative
4. **Open questions** — missing context blocking confident judgment
5. **What to remove, defer, or simplify** — explicit list
6. **What is justified** — complexity or structure that has earned its place

`structure-review`, `test-review`, and `consistency-review` are interrogation-style:
they grill you through a numbered sequence of pointed questions, each with a
recommended answer, and explore the codebase before asking. See [RULES.md](RULES.md)
for the division of labour between the four skills.

## Plugin Structure

```
project-review/
├── .claude-plugin/
│   └── plugin.json
├── RULES.md
├── agents/
│   └── project-reviewer.md   (shared adversarial reviewer persona)
└── skills/
    ├── complexity-review/
    │   ├── SKILL.md
    │   └── references/     (principles, requirements-review, architecture-review, code-pr-review)
    ├── structure-review/
    │   └── SKILL.md
    ├── test-review/
    │   └── SKILL.md
    └── consistency-review/
        └── SKILL.md
```
