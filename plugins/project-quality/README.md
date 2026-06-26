# project-quality

A project-quality toolkit with two families of skills: **read-only adversarial
reviews** that improve project quality, and **thin, human-triggered operations**
that run real workflows defined by the project itself.

## Overview

The two families map to two kinds of work:

1. **Review** — skeptical, read-only audits across five dimensions of a project
   (complexity, structure, tests, consistency, docs), plus `project-review-grill`,
   which challenges a plan or design interactively. Every review challenges the
   artifact from an adversarial stance, cites evidence, and reports prioritised
   findings with recommended fixes. Reviews **never** edit — they suggest, and may
   suggest filing findings as tasks via `tasks:tasks-create` when that skill is present.
2. **Operations** — thin, user-invoked entry points that run a real operation
   (run the tests, cut a release, analyze monitoring). They carry no procedure of
   their own: the real content lives in the project's own markdown
   (`docs/TESTING.md`, `docs/RELEASING.md`, `docs/MONITORING.md`) and any
   installed topic skills.

## Skills

### Reviews (read-only, adversarial)

| Skill | Description |
|---|---|
| `project-review-complexity` | Skeptical complexity review of requirements, architecture, or code — challenges every abstraction and dependency |
| `project-review-structure` | Adversarial review of physical project layout — misplaced files, god-files, dead code, tree-vs-docs drift; routes design verdicts to `project-review-complexity` |
| `project-review-tests` | Adversarial test quality and coverage review — slow suites, unjustified long tests, coverage gaps, weak or unfalsifiable assertions |
| `project-review-consistency` | Adversarial pattern and naming divergence review — competing implementations, uneven naming, inconsistent API shapes |
| `project-review-docs` | Read-only documentation audit — accuracy vs. code, AGENTS.md routing, staleness, missing canonical docs, hollow or duplicated docs |
| `project-review-grill` | Adversarial grilling of a plan, design, or approach — generates pointed questions with recommended answers and sources, then walks them with you one at a time (interactive, not a written report) |

### Operations (thin, human-triggered)

| Skill | Description |
|---|---|
| `project-run-tests` | Run the project's tests as its own `docs/TESTING.md` and installed testing skills define them |
| `project-trigger-release` | Cut a release per the project's own `docs/RELEASING.md` and installed release skills |
| `project-analyze-monitoring` | Analyze recent monitoring data per the project's own `docs/MONITORING.md` and installed monitoring skills |

The operation skills are `user-invocable` and `disable-model-invocation` — a
human triggers them; the model never auto-runs them. If the project has no
guidance for the topic, they stop and ask the user to add the doc rather than
guessing.

## Usage

Invoke a review by describing the need — the harness routes automatically:

```
Review this architecture proposal for complexity
Is this over-engineered?
Does this test suite have meaningful coverage?
Are the naming patterns consistent across the codebase?
Review the docs before I change anything — do they still match the code?
```

Invoke an operation by name (they are user-triggered):

```
/project-run-tests
/project-trigger-release
/project-analyze-monitoring
```

## Review output structure

The five **dimensional** review skills produce the same output skeleton, defined in
the shared `project-reviewer` agent (`project-review-grill` is the exception — it
returns an interactive grill sheet, not this skeleton):

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
| `project-review-tests` | `passing` / `needs work` / `unreliable` |
| `project-review-consistency` | `consistent` / `minor drift` / `significant drift` / `incoherent` |
| `project-review-docs` | `accurate` / `minor gaps` / `significant gaps` / `misleading` |

The `structure`, `tests`, `consistency`, and `docs` skills reach the above output
via interrogation-style procedures: they grill the project through a numbered
sequence of pointed questions, each with a recommended answer, and explore the
codebase before asking. See [RULES.md](RULES.md) for the division of labour
across the two families.

## Plugin structure

```
project-quality/
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
    ├── project-review-tests/
    │   └── SKILL.md
    ├── project-review-consistency/
    │   └── SKILL.md
    ├── project-review-docs/
    │   ├── SKILL.md
    │   ├── references/     (taxonomy, structure, authoring + review guidelines, AGENTS template)
    │   ├── scripts/        (read-only validators: claude-md.sh, inventory.py, validate-routes.py, verify.sh)
    │   └── examples/       (canonical AGENTS.md / docs exemplars)
    ├── project-review-grill/
    │   └── SKILL.md        (interactive adversarial grilling — not forked; see RULES.md §6)
    ├── project-run-tests/
    │   └── SKILL.md
    ├── project-trigger-release/
    │   └── SKILL.md
    └── project-analyze-monitoring/
        └── SKILL.md
```
