# Project-Doc Authoring Guidelines

A project doc exists so an agent can act correctly on this repository without re-deriving it.
**Use** is the root virtue — a doc that is never loaded, or is loaded and skimmed past, has failed
however true every sentence in it is. Every rule below serves being used.

Which file a piece of content belongs to is fixed in [project-setup.md](project-setup.md), by each
file's **Audience** and its *Inside* / *Not inside* boundary. This file is how to write once you are
inside one.

## Ownership

Every fact has **one home**, decided on two axes — and content can satisfy one while failing the
other:

- **Topic** — what the fact is about.
- **Audience** — who it serves. Two files can share a topic and differ by audience: `CODING.md`
  instructs the agent about to change a file, `CONTRIBUTING.md` orients the human proposing a change.

Write into the file that owns the fact, not merely one where the statement is true. Accurate content
in the wrong file is still a defect: the reader who loaded that file for its topic pays for it, and
the reader who needed it never arrives.

**A second copy is worse than a wrong home.** Copies drift — one gets corrected, the other keeps
being read, and nothing in either says which is stale. When two files could hold a fact, one keeps
it and the other links; when a section here restates a section there, cut it and link. This binds
hardest inside a single file, where the same rule restated two sections apart reads as two rules.

The homes most often got wrong:

| Fact | Home |
|---|---|
| Routing — which doc to load for which task | `AGENTS.md`, alone. No topic doc re-lists the files, docs or skills it routes to, or restates its summary. Binds `OVERVIEW.md` hardest, which is next to it in subject. |
| How a change lands — commit, branch, PR, merge, pre-handoff gates | `CHANGE-WORKFLOW.md` |
| What a reviewer must check in this repo | `REVIEWING.md`, never scattered into `CODING.md` |
| Driving the built product by hand | `RUNNING.md` — not `TESTING.md`, which owns the automated suites, and not `MONITORING.md`, which owns reading the evidence afterwards |

## Local delta

An installed skill already carries the generic flow. The doc adds only what the skill cannot know —
this repository's commands, paths, exceptions, and which side wins when they disagree. Name the
skill, then state the delta:

> Use the `commit-commands:commit` skill for the standard flow.
> **Local delta:** add a `Refs: <task-id>` line when a taskmgr task exists for the change.

Restating the skill's own content costs load twice: once to read, and again when the skill changes
and the copy does not.

## Anchors

Every operational rule names something in this repository — a command, a path, a test location, an
entrypoint. Advice that would hold in any repository is advice the model already has; it spends load
and changes nothing:

> **Instead of** "Always run tests before pushing to ensure code quality"
> **write** "Run `make test` from the repo root before `git push`; CI enforces it in
> `.github/workflows/ci.yml`."

Point at a file rather than pasting it — a fifty-line script inline is a fifty-line maintenance
liability that the file itself already holds. Paste only the invariant a reader cannot get by
opening it.

## Command register

Write instructions the way a command reference does, not the way a colleague explains:

- **One instruction per line, in the imperative.** "Create it with the worktree tool" — not "a
  worktree should be created", and not a paragraph the reader has to extract the action from.
- **Rationale earns its place by changing what the reader does.** Keep it as a trailing clause where
  it decides something — "`dev-db` binds `5432`, so stop the other container first" — and cut it
  where it only explains.
- **A paragraph is the last resort**, for the one thing no list can carry.

Anchors are not enough on their own. This passage names three real anchors and is still four lines
of prose:

> A fresh worktree has no `.env` and no running database — copy `.env` across and run `make dev-db`
> in it before `make test-integration`, or the suite fails on a connection error that looks like a
> code bug.

One line does the work:

> Run `scripts/setup-worktree.sh` before any `make` target — a fresh tree has no `.env` and no database.

## Economy

Write for an agent reading under load. Each section as short as its content allows; explicit
headings; one idea per bullet; a link where background would otherwise be retold.

A file that spends more words than its content earns is defective on its own, independent of
accuracy — it buries the procedure it exists to document, and the next reader skims past the line
that mattered. Judge it by naming the spans you would cut, so the claim is falsifiable rather than a
verdict on the file's feel.

## Obligation

An `AGENTS.md` route exists because the doc behind it holds something the agent needs for that kind
of work. State it that way: **`MUST read <doc> before <the action that triggers it>`** — cutting a
release loads `RELEASING.md` first, touching a file in the source tree loads `CODING.md` first,
searching the repository loads `OVERVIEW.md` first. There are no optional routes.

Two things make the obligation fire:

- **Name the triggering action, not the topic.** "before you create or edit ANY file under `src/`"
  fires at a moment the agent can recognize; "for implementation guidance" does not.
- **Say once, in a preamble, that loading afterwards does not count.** Otherwise the route is
  satisfied retroactively by reading the doc once the work is done, which is not routing.

## Failure modes

Use these to diagnose a doc set that is not working.

- **Duplication** — the same fact in two files, or twice in one. Costs maintenance and tokens, and
  inflates the fact's apparent importance. Pick the owner, cut the copy, link.
- **Sediment** — layers that settle because adding feels safe and removing feels risky, until the
  routing file has become a handbook. The default fate of any doc set without a pruning discipline.
- **Advisory route** — "load X to understand Y", "see X for details", "consider reading X". An agent
  under load reads these as skippable and skips them; the routed doc goes unopened while the work
  proceeds from guesswork.
- **Generic advice** — a rule with no anchor into this repository. It reads as content and behaves
  as a no-op.
- **Explanatory prose** — an instruction wrapped in its own justification, so the reader has to
  extract the action before taking it. Anchored prose still fails this: check the register
  separately from the anchors.
- **Hollow doc** — a file whose content is a header plus "No rules yet", "TBD", or "Coming soon".
  It costs a load and returns nothing, and it teaches the reader to distrust the set. Delete it;
  create it when there is something to record.
- **Injected block** — an external tool's `<!-- BEGIN <TOOL> -->` … `<!-- END <TOOL> -->` markers in
  `CLAUDE.md` or `AGENTS.md`. Those two are hand-authored steering surfaces; a generated block
  belongs in a topic doc under `docs/`, or in `.claude.local.md` when it is personal or transient.
- **Left-behind commentary** — review notes, TODOs, and "we should probably…" in the body. Land the
  decision or drop the line.

## Before you land the change

1. Every path and command you wrote is real, and every link and anchor resolves.
2. A skill-backed section names the skill and states only the delta.
3. The change is an **edit, not an append** — it names what the new text replaces, or says why
   nothing is superseded. Rounds of pure addition are each locally reasonable and leave the doc set
   permanently longer.
