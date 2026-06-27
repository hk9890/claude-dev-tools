# project-quality — Design Decisions

Non-derivable design decisions and constraints for this plugin. Read before making changes.

## 1. Three families: reviews, exec, and explain

The plugin is organised around three kinds of work, distinguished by what they do
to the project:

- **Reviews** (`project-review-*`) — read-only audits that improve quality. They
  challenge the artifact, cite evidence, and report findings with recommended
  fixes. They **never** mutate the project.
- **Exec skills** (`project-exec-testing`, `project-exec-releasing`,
  `project-exec-monitoring`) — real actions that run a project workflow. They
  carry no procedure of their own; the procedure lives in the project's own flow
  for that topic.
- **Explain** (`project-explain`) — a single read-only skill that digests how the
  project handles a topic from the project's own docs. It judges nothing and
  changes nothing; it just explains.

This split is the organising principle. A skill belongs to exactly one family,
and its name says which (`project-review-<aspect>`, `project-exec-<topic>` where
`<topic>` names the project flow the skill defers to — testing, releasing,
monitoring — or `project-explain`). Reviews and exec are families with one skill
per distinct procedure; explain is a single skill because explaining is one
procedure parameterised by topic (see rule 11).

## 2. This plugin is a consolidation of three former plugins

`project-quality` replaces the former `project-review`, `project-ops`, and
`project-docs` plugins, which were merged into one. The reason: the exec family
sits alongside the same "how things should be" knowledge that reviews own (e.g. the canonical
docs taxonomy under `project-review-docs/references/`). Splitting them across
plugins would force fragile cross-plugin references; one plugin makes that
knowledge a first-class internal resource for both the review and exec families.

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
and it does not tell the user which file to add.

Each exec skill declares an `argument-hint` (`[what-to-test]`, `[version-or-scope]`,
…) and threads `$ARGUMENTS` into the body to scope the work. When the project
offers more than one path and the argument does not settle which, the skill asks
the user rather than assuming. Any per-action safety (confirm before publishing a
release, keep monitoring read-only, do not auto-fix failing tests) belongs in the
project's own flow, not restated here — the harness already confirms irreversible
outward-facing steps regardless.

## 5. Skills-only — no commands

There are no slash-command wrappers. Review skills are model-invocable (via their
`description`) and user-invocable by natural language; exec skills and
`project-explain` are user-invocable (`disable-model-invocation`). A command
wrapper adds a second invocation path to maintain for no benefit.

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

**Exception — `project-review`.** The orchestrator (rule 12) also runs unforked, in
the main loop, because it must author and run a Workflow and then render the merged
result. Its *finders*, however, are forked `project-reviewer` agents — the fork
moves down a level, from the skill to each dimension finder.

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

## 11. Explain is a single parameterised skill, not a family

`project-explain` is `user-invocable: true` + `disable-model-invocation: true` and
**read-only** — it shares the reviews' no-mutation contract but, like the exec
skills, is human-triggered only (a model that could auto-invoke it would fire on
nearly every "how does X work?" question). It is deliberately **one** skill rather
than a `project-explain-<topic>` family: the number of skills in a family tracks
the number of genuinely distinct procedures, and explaining is a single procedure —
read the project's own docs for the named topic and digest them in ~200 words —
parameterised only by which topic. Like the exec bodies it names no doc paths (the
project's own routing locates the source of truth) and invents nothing beyond what
the docs state; it declines with "not documented" rather than guessing when the
topic has no docs, and asks the user when the topic is ambiguous. This is the
natural home for explaining topics that are knowledge rather than actions —
`overview` and `change-workflow` among them — which is why neither has an exec skill.

This also drew the family's boundary the other way: there is no `project-exec-coding`.
"Implement a change following the project's conventions" is the agent's ordinary job
(those conventions already live in the project's steering docs, which the agent reads
anyway), so a thin exec pointer added an invocation path for behaviour you get for
free — and it could not honour the family's "do nothing if not configured" invariant
without a special-case exception. Knowledge *about* the project's coding conventions
is served by `project-explain coding`; performing the work is not a project-quality
operation.

## 12. project-review is the orchestrating umbrella over the dimensional reviewers

`project-review` runs the five dimensional reviewers, verifies their findings, and
returns one prioritised list — so the user does not run five skills and merge five
reports by hand. Design decisions behind it:

- **Umbrella name.** It takes the family-parent name `project-review` (the
  `project-review-<aspect>` skills are its members). This is the rule-1 naming shape's
  one allowed parent form — analogous to `project-explore:project-explore` — not a
  bare-verb violation.
- **User-invoked only** (`user-invocable: true` + `disable-model-invocation: true`),
  unlike the model-discoverable dimensional skills. A full run can spawn a dozen-plus
  agents (a finder and a sweep per dimension, plus a verifier per finding); that cost
  must be an explicit human choice, not an auto-trigger off "review my project". The
  dimensional skills stay model-discoverable for cheap single-lens use.
- **Not forked** — see the rule 6 exception. It runs in the main loop, authors a
  Workflow (Find → Verify → Sweep → Synthesise), runs it, and renders the result. If
  the Workflow tool is absent it falls back to the same stages via the Task tool.
- **No procedure duplication.** Each finder reads the dimension's own `SKILL.md` as
  the single source of truth and follows it; the orchestrator carries no copy of any
  dimension's procedure. This is why the dimensional procedures were *not* extracted
  into shared `references/` — that would relocate the one copy and add an indirection
  hop without removing any duplication.
- **Verify pass.** Every candidate finding is judged by a separate adversarial
  `project-reviewer` verifier (on a cheaper model) that tries to *refute* it; REFUTED
  findings are dropped. Tiers tune recall vs. cost: `--low` keeps CONFIRMED only;
  `--medium` keeps CONFIRMED + PLAUSIBLE; `--high` (default) adds a Sweep gap-finder
  pass. The verify pass applies even to a single-dimension run.
- **Cross-dimension hand-off (rule 8) is consumed here.** A finding whose `route_to`
  names another reviewer in the run is folded into that dimension during synthesis —
  the one place the `route_to` field is acted on rather than merely reported.
- **Read-only, like every review.** It reports and may suggest `tasks:tasks-create`;
  it never edits the project or a tracker.
- **Finders emit structured output.** Finders and verifiers run the `project-reviewer`
  agent in its structured-output mode (a schema replaces the prose skeleton); the
  field meanings are unchanged (see the agent's "Structured output mode").
