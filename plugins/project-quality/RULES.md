# project-quality — Design Decisions

Non-derivable design decisions and constraints for this plugin. Read before making changes.

## 1. Two families: reviews and exec skills

The plugin is organised around exactly two kinds of work, distinguished by what
they do to the project:

- **Reviews** (`project-review-*`) — read-only audits that improve quality. They
  challenge the artifact, cite evidence, and report findings with recommended
  fixes. They **never** mutate the project.
- **Exec skills** (`project-exec-testing`, `project-exec-releasing`,
  `project-exec-monitoring`, `project-exec-coding`) — real actions that run a
  project workflow. They carry no procedure of their own; the procedure lives in
  the project's own flow for that topic.

This split is the organising principle. A skill belongs to exactly one family,
and its name says which (`project-review-<aspect>` vs `project-exec-<topic>`,
where `<topic>` names the project flow the skill defers to — testing, releasing,
monitoring, coding).

## 2. This plugin is a consolidation of three former plugins

`project-quality` replaces the former `project-review`, `project-ops`, and
`project-docs` plugins, which were merged into one. The reason: the exec family
sits alongside the same "how things should be" knowledge that reviews own (e.g. the canonical
docs taxonomy under `project-review-docs/references/`). Splitting them across
plugins would force fragile cross-plugin references; one plugin makes that
knowledge a first-class internal resource for both families.

## 3. Docs are reviewed, never operated on

The former `project-docs` plugin had create / update / improve / revise flows
that *edited* docs. Those are all gone. Documentation has **no** operation in this
plugin — only `project-review-docs`, a read-only auditor. It analyses across all
three former concerns (missing canonical docs, staleness vs. code, structural
quality) and emits prioritised **suggestions**; applying any fix is the user's
separate, manual step. There is deliberately no `project-apply-docs` or equivalent.

## 4. Exec skills are thin, human-triggered pointers

Every exec skill (`project-exec-*`) is `user-invocable: true` +
`disable-model-invocation: true` — a human triggers it; the model never auto-runs
it. The body is deliberately tiny and uniform across the family: a few words
naming the action, a `$ARGUMENTS` scope line, one instruction to follow the
project's own flow for that topic exactly and invent nothing, the defensive "ask,
don't assume" hint, and a closing report line. It deliberately names **no** doc
paths and **no** routing — when a human runs it, the project's own routing already
points at the source of truth, so hard-coding `docs/TESTING.md` etc. would just be
a second place to drift.

If the project defines no flow for the topic, the skill does **nothing** and
reports that the topic is **not configured** for this project. It does not guess,
and it does not tell the user which file to add. The lone exception is
`project-exec-coding`: with no documented coding conventions there is simply
nothing project-specific to apply, so it implements normally and notes the absence
rather than refusing.

Each exec skill declares an `argument-hint` (`[what-to-test]`, `[what-to-implement]`,
…) and threads `$ARGUMENTS` into the body to scope the work. When the project
offers more than one path and the argument does not settle which, the skill asks
the user rather than assuming. Any per-action safety (confirm before publishing a
release, keep monitoring read-only, do not auto-fix failing tests) belongs in the
project's own flow, not restated here — the harness already confirms irreversible
outward-facing steps regardless.

## 5. Skills-only — no commands

There are no slash-command wrappers. Review skills are model-invocable (via their
`description`) and user-invocable by natural language; exec skills are
user-invocable. A command wrapper adds a second invocation path to maintain for
no benefit.

## 6. Reviewer skills run forked and share one persona agent

Each review skill runs in a forked context (`context: fork`) and delegates to a
single shared agent, `agents/project-reviewer.md`. That agent encodes:

- the *attitude* common to every review — the read-only contract,
  explore-before-judging, the recommended-answer rule, the adversarial
  disposition, directness, and evidence-citing;
- the *output skeleton* every review must conform to — Verdict, Findings (with a
  fixed 5-field schema), and a prioritised Recommended actions list.

Each review `SKILL.md` keeps its own *procedure*, its own *verdict label set*, and
any *optional opening or middle sections*. The skill may extend the agent's
skeleton; it may not drop, rename, or reshape the mandatory sections. There is no
`skills/_shared/` directory; procedure, principles, and verdict label sets stay
per-skill.

**Exception — `project-review-grill`.** The grill skill is deliberately **not**
forked. Grilling walks a sheet of questions with the user one at a time, which a
forked context cannot do (a fork returns a single result and cannot hold a live
back-and-forth). So the skill runs in the main loop: it spawns `project-reviewer`
in *grill mode* to generate the sheet in isolation, then conducts the interactive
walkthrough itself. Grill mode is also the one sanctioned exception to the agent's
output skeleton — it returns a grill sheet (question · recommended answer · why ·
source · `grill-status`) instead of Verdict/Findings/Recommended actions.

## 7. complexity is verdict-first; the other reviews interrogate

`project-review-structure`, `-tests`, `-consistency`, and `-docs` use
interrogation-style procedures — numbered sequences of questions with recommended
answers. `project-review-complexity` deliberately does NOT: its procedure is
verdict-first (pick `approve` / `approve with concerns` / `needs clarification` /
`reject` and defend it). This commits the reviewer to a stance and forces
justification rather than deferring judgment behind a question list. It is a
constraint on the *procedure*, not the *output format* (see rule 6).

## 8. Hand-off between reviewers

A review routes a finding to another reviewer rather than judging outside its
remit. `project-review-structure` routes design-level verdicts (is the
abstraction worth having?) to `project-review-complexity`. `project-review-docs`
routes a doc that is wrong because the *thing it describes* is wrong to the
relevant reviewer (complexity for design, structure for layout), flagging only the
documentation defect itself.

## 9. project-review-docs ships its own references, scripts, and examples

Unlike the other reviewers, the docs auditor carries a reference library (the
canonical taxonomy, structure rules, authoring bar, AGENTS template, and the
exhaustive review guidelines), read-only validator `scripts/`, and `examples/` of
good docs. These are the "how docs should be" knowledge the audit judges against,
and the validators (`claude-md.sh`, `inventory.py`, `validate-routes.py`,
`verify.sh`) are a cheap first pass. `validate-routes.py` is also imported by the
repo's own `scripts/check-internal-consistency.py`; keep that path in sync if the
skill is ever moved or renamed.

## 10. Reviews may suggest task creation, never perform it

The read-only contract (rule 1) covers the **project**; it does not let a reviewer
write a **tracker** either. A review may *suggest* the user run a task-creation skill
(`tasks:tasks-create`) to file its findings, but it must never create, edit, or close
tracker issues itself — the suggestion is phrased as something the user does. The offer
is conditional and dependency-free: project-quality declares no dependency on the
`tasks` plugin and the offer is omitted when no such skill is present. This keeps the
"reviews suggest, the human acts" boundary intact while letting findings flow into a
tracker when one exists.
