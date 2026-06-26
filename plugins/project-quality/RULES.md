# project-quality — Design Decisions

Non-derivable design decisions and constraints for this plugin. Read before making changes.

## 1. Two families: reviews and operations

The plugin is organised around exactly two kinds of work, distinguished by what
they do to the project:

- **Reviews** (`project-review-*`) — read-only audits that improve quality. They
  challenge the artifact, cite evidence, and report findings with recommended
  fixes. They **never** mutate the project.
- **Operations** (`project-run-tests`, `project-trigger-release`,
  `project-analyze-monitoring`) — real actions that run a project workflow. They
  carry no procedure of their own; the procedure lives in the project's markdown.

This split is the organising principle. A skill belongs to exactly one family,
and its name says which (`project-review-<aspect>` vs `project-<verb>-<object>`).

## 2. This plugin is a consolidation of three former plugins

`project-quality` replaces the former `project-review`, `project-ops`, and
`project-docs` plugins, which were merged into one. The reason: operations depend
on the same "how things should be" knowledge that reviews own (e.g. the canonical
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

## 4. Operations are thin, human-triggered pointers

Every operation skill is `user-invocable: true` + `disable-model-invocation: true`
— a human triggers it; the model never auto-runs it. The skill body is
deliberately small: it names the project's canonical doc (`docs/TESTING.md`,
`docs/RELEASING.md`, `docs/MONITORING.md`), the matching `AGENTS.md` routing, and
any installed topic skill as the source of truth, then defers. It invents no
commands. If the project has no such guidance, the skill stops and asks the user
to add the doc rather than guessing. The real content belongs in the project's
own markdown, not in the skill.

## 5. Skills-only — no commands

There are no slash-command wrappers. Review skills are model-invocable (via their
`description`) and user-invocable by natural language; operation skills are
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
