# Review Process & Rubric (Read-Only)

The **process** of reviewing project docs is executed by the `project-review-docs`
workflow (`workflow/review-docs.js`) — not by a human following prose. This file
is the shared rubric that workflow's agents apply and the vocabulary its report
uses.

Use with:

- [project-setup.md](project-setup.md) — canonical doc set + file ownership (Inside / Not inside)
- [project-doc-guidelines.md](project-doc-guidelines.md) — authoring rules A1–A10 + hard prohibitions

## Rule codes

- **A1–A10** — the authoring rules (defined in `project-doc-guidelines.md`).
- **R10** — audience/purpose fit: content outside a file's *Inside* boundary is a finding even when accurate (the review-side of A10).
- **R11** — canonical-topic placement: a non-canonical doc whose content *is* a canonical topic is renamed (empty slot) or linked (filled slot).

## Read-only contract (mandatory)

- **No edits:** never modify docs, source, config, or tracker state.
- **Suggest, never apply:** every finding carries a recommended fix; applying it is the user's separate step.
- The execution stage *runs* documented commands, but only in a throwaway git worktree and never destructively — the repo under review is left untouched.

## The four stages (what the workflow does)

1. **Manifest** — `scripts/manifest.py` emits the deterministic facts (files, present/missing canonical docs, line/word/byte counts, link + anchor resolution, reachability from `AGENTS.md`, the `CLAUDE.md` invariant, hollow docs, routes). Facts only; scripts never judge belonging or accuracy.
2. **Read-review** — one agent per doc, each carrying only its own ownership contract. For every unit of content it asks *true?* (verify against the repo) and *belongs here?* (accurate-but-misplaced content is a finding — A10/R10), and judges form (compact, agent-facing, not bloated). Non-standard docs are judged for placement (R11).
3. **Execution test** — the docs are used, not just read. Per `AGENTS.md` route: a driver generates a task from the target doc and holds the answer key; a cold, uncoached action agent attempts it from `AGENTS.md` in a worktree; the driver grades the session against its key.
4. **Synthesis** — merge, dedupe, and reconcile across files (sibling contradictions; a missing canonical doc whose content lives under a different name), then verdict + report.

## Severity

- `blocker` — a documented fact/procedure that is wrong or a doc that is largely the wrong genre for its owner; misleads confidently.
- `major` — a real scope/actionability/belonging gap (a localized out-of-boundary spill, a stale command, a routing gap).
- `minor` — clarity/scanability/compactness.

Raise one level when the defect directly breaks a real workflow (a stale command in `RELEASING.md` is a blocker, not a minor).

## Execution verdicts

Each `AGENTS.md` route ends on one of: **routed-and-succeeded** · **found-but-insufficient** (doc content gap) · **couldnt-route** (routing gap) · **didnt-need-doc** (doc redundant with general knowledge) · **inconclusive** (failure attributable to environment or the agent, not the doc — discarded). Attribution to doc / agent / environment is the driver's core judgment; get it wrong and the stage either misses real bugs or cries wolf.

## Overall verdict

- `accurate` — no blocker/major, and positive coverage across the read-review and execution stages (not merely the absence of findings).
- `minor gaps` — only minor findings.
- `significant gaps` — one or more major, no blocker.
- `misleading` — one or more blocker.

## Adversarial stance

A green manifest (links resolve, no missing files) is **necessary, not sufficient**. Only reading each doc against the repo catches the confident falsehood, only the ownership contract catches the accurate-but-misplaced section, and only running the docs catches the stale-but-plausible procedure. Never report "docs look good" from the manifest alone; a clean verdict is earned by checking, not by the absence of obvious problems.
