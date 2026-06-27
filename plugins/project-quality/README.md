# project-quality

A project-quality toolkit with two families of skills: **read-only adversarial
reviews** that improve project quality, and **thin, human-triggered exec skills**
that run real workflows defined by the project itself.

## Overview

The two families map to two kinds of work:

1. **Review** — skeptical, read-only audits across five dimensions of a project
   (complexity, structure, tests, consistency, docs), plus `project-review-grill`,
   which challenges a plan or design interactively. Every review challenges the
   artifact from an adversarial stance, cites evidence, and reports prioritised
   findings with recommended fixes. Reviews **never** edit — they suggest, and may
   suggest filing findings as tasks via `tasks:tasks-create` when that skill is present.
2. **Exec** — thin, user-invoked entry points (`project-exec-*`) that run a real
   operation (run the tests, cut a release, analyze monitoring, implement to the
   project's conventions). They carry no procedure of their own: the real content
   lives in the project's own flow for that topic, and the skill defers to it.

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

### Exec (thin, human-triggered)

| Skill | Argument | Description |
|---|---|---|
| `project-exec-testing` | `[what-to-test]` | Run the project's tests the way the project's own testing flow defines them |
| `project-exec-releasing` | `[version-or-scope]` | Cut a release the way the project's own release flow defines it |
| `project-exec-monitoring` | `[what-to-analyze]` | Analyze monitoring data the way the project's own monitoring flow defines it |
| `project-exec-coding` | `[what-to-implement]` | Implement a change strictly following the project's own coding conventions |

The exec skills are `user-invocable` and `disable-model-invocation` — a human
triggers them; the model never auto-runs them. Each takes an optional argument
that scopes the work. If the project defines no flow for the topic, the skill
does nothing and reports that the topic is **not configured** — it does not guess
and does not prescribe which file to add. The one exception is
`project-exec-coding`: with no documented conventions there is simply nothing
project-specific to apply, so it implements normally and notes the absence.

## Usage

Invoke a review by describing the need — the harness routes automatically:

```
Review this architecture proposal for complexity
Is this over-engineered?
Does this test suite have meaningful coverage?
Are the naming patterns consistent across the codebase?
Review the docs before I change anything — do they still match the code?
```

Invoke an exec skill by name (they are user-triggered; the argument is optional):

```
/project-exec-testing
/project-exec-releasing
/project-exec-monitoring
/project-exec-coding add a --dry-run flag to the importer
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
    ├── project-exec-testing/
    │   └── SKILL.md
    ├── project-exec-releasing/
    │   └── SKILL.md
    ├── project-exec-monitoring/
    │   └── SKILL.md
    └── project-exec-coding/
        └── SKILL.md
```
