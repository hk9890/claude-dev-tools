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
per distinct procedure; the review family additionally exposes the `project-review`
umbrella (rule 12) that runs all five dimensions together; explain is a single skill
because explaining is one procedure parameterised by topic (see rule 11).

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

**Exception — `project-review`.** The orchestrator (rule 12) runs unforked, in the
main loop, because it must author and run a Workflow and then render the merged
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
`verify.sh`) are a cheap first pass.

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

- **Umbrella name.** `project-review` is an ordinary `<plugin-domain>-<topic>` name —
  domain `project`, topic `review`, the same shape as `project-explain` — that also
  heads the `project-review-<aspect>` family (its members add an aspect suffix). It needs
  no naming exception: it is the `<plugin-domain>-<topic>` shape that `docs/CODING.md`
  already sanctions (see rule 1), not the plugin's-own-name exception.
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

## 13. REVIEWING.md is an optional-canonical doc that reviewers consume

`docs/REVIEWING.md` holds a project's **local review delta** — the repo-specific review
policy, priorities, and out-of-scope rules the generic review lenses cannot know.
Decisions behind it:

- **Optional-canonical, not full canonical.** `scripts/inventory.py` carries it in a
  separate `OPTIONAL_CANONICAL_DOCS` tier: recognized as canonical when present, but
  never reported missing when absent. Most repos have no local review delta, so a
  full-canonical "REVIEWING.md missing" warning on every repo would be pure noise. The tier
  (`OPTIONAL_CANONICAL_DOCS`) exists so the taxonomy can *name* a doc without *demanding*
  it; `RUNNING.md` (§14) is the other doc in this tier.
- **Reviewers consume it.** The shared `project-reviewer` persona reads
  `docs/REVIEWING.md` (when present) during its explore-before-judge pass and treats its
  rules as authoritative local constraints — so all five dimensional reviewers and the
  `project-review` umbrella's finders honor it from one edit, not five.
- **Local policy wins.** Where `REVIEWING.md` conflicts with a skill's generic lens, the
  local rule takes precedence. The doc supplies the delta; the skills supply the reusable
  lens (see the ownership block in `project-review-docs/references/project-setup.md` and
  authoring rule A8).
- **No `project-exec-reviewing`.** Reviewing is the reviews family's job, and "run the
  project's review" already exists as the `project-review` umbrella (rule 12). The exec
  family is reserved for operational workflows that *act on* the project (run tests, cut a
  release, pull monitoring); reviews are read-only by rule 1. An exec-reviewing skill would
  duplicate the umbrella and miscategorise a read-only operation — the same reasoning that
  rules out `project-exec-coding` (rule 11). `project-explain reviewing` covers the
  knowledge side; the umbrella covers the doing side.

## 14. RUNNING.md is an optional-canonical doc for driving the product

`docs/RUNNING.md` holds the **local delta** an agent needs to launch and drive a project's
built product by hand — to reproduce a reported bug or verify an outcome after a task. It is
agent-facing: it documents how the *agent* operates the product, which can diverge from the
human path (a browser-automation tool, a TUI-inspection script). Decisions behind it:

- **Optional-canonical, not full canonical.** Carried in `scripts/inventory.py`'s
  `OPTIONAL_CANONICAL_DOCS` tier alongside `REVIEWING.md` (§13): recognized when present,
  never reported missing when absent. A pure library whose tests are its only exercise path
  has no product to drive, so a full-canonical "RUNNING.md missing" warning would be noise.
- **Boundaries are fixed by authoring rule A9.** `TESTING.md` owns the automated suites and
  gates (repeatable pass/fail you maintain); `RUNNING.md` owns ad-hoc operation of the live
  artifact. `MONITORING.md` owns the evidence trail of what already happened; `RUNNING.md`
  drives the product to make something happen. Bug reproduction is driven from `RUNNING.md`,
  which may pull `MONITORING.md` data as supporting evidence. The generic launch-and-drive
  flow is left to the built-in `run`/`verify` skills (rule A4).
- **No in-repo agent consumes it, so nothing is wired.** Unlike `REVIEWING.md`, which the
  `project-reviewer` persona reads mid-review (§13), `RUNNING.md` has no in-repo agent that
  ingests it during work — like `OVERVIEW.md` and `CODING.md`, its consumer is `AGENTS.md`
  routing followed by a general agent (plus `project-explain running` and the inventory
  validator). There is deliberately no agent change.
- **No `project-exec-running`.** The built-in `run`/`verify` skills already cover the doing
  side (launching and driving the app); an exec-running skill would duplicate them. The
  knowledge side is `project-explain running`. This mirrors the reasoning that rules out
  `project-exec-coding` (rule 11) and `project-exec-reviewing` (§13).

## 15. Canonical-topic docs are matched by content, not inferred from the codebase

`project-review-docs` flags a doc whose **content** is a canonical topic but whose **name** is
not the canonical one — e.g. a `RUNTIME_UI_VERIFICATION.md` that is really `RUNNING.md`.
Decisions behind the check (specialist #9, rule R11, coverage category C14):

- **Content-driven, never codebase-inferred.** The signal is the text of docs that already
  exist — read and classified against the *Inside* boundaries in `project-setup.md` — not a
  heuristic guess about whether the repo "ships a runnable product." File-sniffing for a product
  (a `main`, a `bin` entry, a shell script) is unreliable — nearly every repo has those — so it
  is deliberately not attempted. `scripts/inventory.py` does no codebase product-sniffing; it
  only enumerates the candidate docs the specialist reads — `non_canonical_docs` (top-level
  `docs/`), `non_canonical_docs_nested` (`docs/` subdirectories, recursively), and
  `non_canonical_root_docs` (non-canonical root `*.md`, excluding well-known meta files).
- **Rename when the slot is empty, link when it is filled.** If no `docs/<TOPIC>.md` exists,
  recommend renaming the misnamed file into that slot; if it already exists, recommend linking the
  on-topic doc from it (a second file cannot also claim the canonical name). A doc that maps to no
  canonical topic is legitimately project-specific and draws no finding.
- **It never invents a doc for an absent topic.** The check acts only on docs that exist, so the
  optional-canonical "never reported missing when absent" contract (§13, §14) is untouched — a
  pure library with no running/review docs is still left alone.
- **Whole-doc mirror of R10.** R10/C13 (specialist #8) polices content *inside* a canonical doc
  against its boundary; R11/C14 (specialist #9) polices a doc that *is* a canonical topic but is
  misnamed or unlinked. Together they enforce the canonical-placement authoring rules A6/A8/A9
  from both the content and the file-naming directions.
