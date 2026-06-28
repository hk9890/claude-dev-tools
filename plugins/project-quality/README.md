# project-quality

A project-quality toolkit with three families of skills: **read-only adversarial
reviews** that improve project quality, **thin, human-triggered exec skills** that
run real workflows defined by the project itself, and a human-triggered
**explainer** that digests how the project handles a topic from its own docs.

## Overview

The three families map to three kinds of work:

1. **Review** — skeptical, read-only audits across five dimensions of a project
   (complexity, structure, tests, consistency, docs). The five dimensions run
   individually, or all at once via `project-review`, which orchestrates them,
   adversarially verifies every finding, and returns one prioritised action list.
   Every review challenges the artifact from an adversarial stance, cites evidence,
   and reports prioritised findings with recommended fixes. Reviews **never** edit —
   they suggest, and may suggest filing findings as tasks via `tasks:tasks-create`
   when that skill is present.
2. **Exec** — thin, user-invoked entry points (`project-exec-*`) that run a real
   operation (run the tests, cut a release, analyze monitoring). They carry no
   procedure of their own: the real content lives in the project's own flow for
   that topic, and the skill defers to it.
3. **Explain** — a single user-invoked skill (`project-explain`) that reads the
   project's own docs for a topic and digests, in ~200 words, how this project
   handles it. Read-only; it never changes anything.

## Skills

### Reviews (read-only, adversarial)

`project-review` is the umbrella: it runs the five dimensional reviewers, verifies
each finding, and merges them into one prioritised list. The dimensional skills
below also run standalone — cheaper, single-lens, and model-discoverable.

| Skill | Description |
|---|---|
| `project-review` | **Orchestrator** — runs the five dimensions (or a chosen subset), adversarially verifies each finding, resolves cross-dimension hand-offs, and returns one prioritised action list. Tiers `--low` / `--medium` / `--high` (default). User-invoked only. |
| `project-review-complexity` | Skeptical complexity review of requirements, architecture, or code — challenges every abstraction and dependency |
| `project-review-structure` | Adversarial review of physical project layout — misplaced files, god-files, dead code, tree-vs-docs drift; routes design verdicts to `project-review-complexity` |
| `project-review-tests` | Adversarial test quality and coverage review — slow suites, unjustified long tests, coverage gaps, weak or unfalsifiable assertions |
| `project-review-consistency` | Adversarial pattern and naming divergence review — competing implementations, uneven naming, inconsistent API shapes |
| `project-review-docs` | Read-only documentation audit — accuracy vs. code, AGENTS.md routing, staleness, missing canonical docs, hollow or duplicated docs, misnamed or unlinked canonical-topic docs, and audience/purpose fit (e.g. a build/dev-oriented README that should serve users) |

### Exec (thin, human-triggered)

| Skill | Argument | Description |
|---|---|---|
| `project-exec-testing` | `[what-to-test]` | Run the project's tests the way the project's own testing flow defines them |
| `project-exec-releasing` | `[version-or-scope]` | Cut a release the way the project's own release flow defines it |
| `project-exec-monitoring` | `[what-to-analyze]` | Analyze monitoring data the way the project's own monitoring flow defines it |

The exec skills are `user-invocable` and `disable-model-invocation` — a human
triggers them; the model never auto-runs them. Each takes an optional argument
that scopes the work. If the project defines no flow for the topic, the skill
does nothing and reports that the topic is **not configured** — it does not guess
and does not prescribe which file to add.

### Explain (one skill, human-triggered)

| Skill | Argument | Description |
|---|---|---|
| `project-explain` | `[topic]` | Read the project's own docs for a topic and explain, in ~200 words, how *this* project handles it |

`project-explain` is `user-invocable` + `disable-model-invocation` and read-only.
Unlike exec it is a **single** skill, not a per-topic family: explaining is one
procedure parameterised by topic (`overview`, `change-workflow`, `releasing`, `reviewing`, `running`, …),
so one skill with an argument covers them all. If the project has no docs for the
topic it says so rather than inventing an answer; if the topic is ambiguous it
asks. This is the natural home for topics that are knowledge rather than actions —
`overview` and `change-workflow` among them, which is why neither has an exec skill.

## Usage

Invoke a review by describing the need — the harness routes automatically:

```
Review this architecture proposal for complexity
Is this over-engineered?
Does this test suite have meaningful coverage?
Are the naming patterns consistent across the codebase?
Review the docs before I change anything — do they still match the code?
```

Run the full, verified review across every dimension (user-invoked; all arguments
optional — pick a dimension subset and/or a scope to cut cost, choose a tier):

```
/project-review
/project-review complexity,tests src/
/project-review docs --low
```

Invoke an exec skill by name (they are user-triggered; the argument is optional):

```
/project-exec-testing
/project-exec-releasing
/project-exec-monitoring
```

Ask for a digest of how the project handles a topic:

```
/project-explain change-workflow
/project-explain releasing
/project-explain reviewing
/project-explain running
```

## Review output structure

The five **dimensional** review skills produce the same output skeleton, defined in
the shared `project-reviewer` agent:

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
across the families.

`project-review` consolidates these into one report: it keeps each dimension's own
verdict label, then merges all surviving findings — each tagged with its verify
result (CONFIRMED / PLAUSIBLE) — into a single prioritised `Recommended actions`
list. See [RULES.md](RULES.md) §12 for how the orchestration and the verify pass work.

## Plugin structure

```
project-quality/
├── .claude-plugin/
│   └── plugin.json
├── RULES.md
├── agents/
│   └── project-reviewer.md   (shared adversarial reviewer persona)
└── skills/
    ├── project-review/
    │   └── SKILL.md        (orchestrator — runs the dimensions, verifies, synthesises; not forked; see RULES.md §12)
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
    ├── project-exec-testing/
    │   └── SKILL.md
    ├── project-exec-releasing/
    │   └── SKILL.md
    ├── project-exec-monitoring/
    │   └── SKILL.md
    └── project-explain/
        └── SKILL.md
```
