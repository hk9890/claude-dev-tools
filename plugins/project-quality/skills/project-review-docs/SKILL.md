---
name: project-review-docs
description: "Read-only audit of a project's docs for accuracy, staleness, gaps, and duplication — reports fixes, never edits."
when_to_use: "Use when the user wants a documentation review or audit. Triggers on 'are our docs stale?', 'do our docs match the code?', 'does AGENTS still match the repo?', 'audit the documentation'. Not for complexity, structure, consistency, or test reviews — each has its own skill."
argument-hint: "[what-to-review]"
context: fork
agent: project-reviewer
---

## Invocation

What to review: $ARGUMENTS

An optional free-form description that scopes the review — for example "the
`docs/` tree", "AGENTS.md routing", or a path. If no argument is given, review
the whole project's documentation.

## Role and contract

You are an adversarial auditor of project documentation. You interrogate the
docs against the actual repository — you do not take them at their word. Your
remit is narrow: whether the documentation is **accurate** (matches the code),
**routed** (AGENTS.md points to real, reachable files), **complete** (the
canonical docs that should exist do), and **clean** (no hollow, duplicated, or
misplaced docs).

This review runs in an isolated context — you cannot ask the user anything and
never pause for input. **Suggest, never apply:** every finding carries a
recommended fix, but applying it is the user's separate, manual step. Your only
deliverable is the structured report — never an edit, an action on the user's
behalf, or a question awaiting a reply.

Hand-off rule: if a doc is wrong because the *thing it describes* is wrong (a
bloated design, a tangled module layout), flag the doc and route the underlying
verdict to the right reviewer (`project-review-complexity` for design,
`project-review-structure` for layout) — do not judge the architecture here.

## Review procedure

Read `AGENTS.md`, `README.md`, `CLAUDE.md`, and the `docs/` tree first; never
ask what the files already answer. Then work through these questions in order.
For each, state the recommended answer and resolve it from the actual files
before moving on. The audit criteria, ownership taxonomy, and authoring bar live
in `references/` — load them as you go:

- [references/project-setup.md](references/project-setup.md) — canonical doc set + file ownership (the bar for "what should exist")
- [references/project-structure.md](references/project-structure.md) — structural + AGENTS routing constraints
- [references/project-doc-guidelines.md](references/project-doc-guidelines.md) — authoring quality bar (A1–A7, hard prohibitions) and the Bad→Good fix vocabulary
- [references/agents-md-template.md](references/agents-md-template.md) — the AGENTS.md conformance standard
- [references/project-doc-review-guidelines.md](references/project-doc-review-guidelines.md) — the exhaustive audit discipline: coverage table (C1–C12), severity rubric, validator scripts, specialist fan-out

For a quick pass, work the six questions below. For an exhaustive audit (or when
the user asks for thoroughness), follow `project-doc-review-guidelines.md` end to
end — its `scripts/` validators are a cheap, read-only first pass:

This review runs forked, with the working directory set to the repo under review —
not this skill's directory — so the bundled scripts must be anchored. `$CLAUDE_PLUGIN_ROOT`
is **not** exported into Bash tool subprocesses; locate the install under `$HOME` instead
(the repo's house pattern), then run the validators from the resolved path:

```bash
PLUGIN_DIR=$(find "$HOME/.claude/plugins/cache" -maxdepth 3 -type d -name project-quality | head -1)
SCRIPTS="$(find "$PLUGIN_DIR" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)/skills/project-review-docs/scripts"

"$SCRIPTS/claude-md.sh" check <repo-root>                       # CLAUDE.md is exactly @AGENTS.md
"$SCRIPTS/inventory.py" <repo-root>                             # missing/non-canonical docs, location violations
"$SCRIPTS/validate-routes.py" <repo-root> --include-docs --json # unresolved references
```

`verify.sh` in the same directory runs all three in sequence and prints a combined
summary — use `"$SCRIPTS/verify.sh" <repo-root>` for a one-shot pass.

### 1. Does the documentation match the code? (dimension b — accuracy)

Extract every concrete claim in the canonical docs ("there are no tests", "X
runs in CI", "only A and B exist", a command, a path) and verify each against
the repo with read-only `grep`/`read`.

- Recommended answer: _every load-bearing claim is verified against observable repo state._
- Resolve from the code: which claims are contradicted by what the repo actually shows?

### 2. Is AGENTS.md routing correct and complete? (dimension c — routing)

Every route in `AGENTS.md` must resolve to a real file or installed skill, and
every `docs/**/*.md` must be reachable from `AGENTS.md` (directly or via a doc it
routes to). `CLAUDE.md` must be exactly `@AGENTS.md`.

- Recommended answer: _all routes resolve; no doc is orphaned; CLAUDE.md is the one-line import._
- Resolve from the code: run `validate-routes.py` and `claude-md.sh check`; list broken routes and orphaned docs.

### 3. Do the canonical docs that should exist actually exist? (dimension a — coverage)

Compare the repo's real surface (top-level dirs, test layer, release process,
observability) against the canonical doc set in `project-setup.md`. A topic with
real local guidance but no doc is a gap; a topic fully covered by an installed
skill with no local delta is *not* a gap (do not demand a hollow doc).

- Recommended answer: _every topic with real local guidance has its canonical doc; nothing material is undocumented._
- Resolve from the code: run `inventory.py`; which canonical docs are missing for topics that genuinely need them?

### 4. Any hollow, duplicated, or misplaced docs? (dimension c — quality)

Check against the hard prohibitions in `project-doc-guidelines.md`: stub/
placeholder docs ("TBD", "No rules yet"), `AGENTS.md` content duplicated into
`docs/`, content living in the wrong canonical file, auto-injected tool blocks
in steering surfaces.

- Recommended answer: _no hollow docs; no AGENTS duplication; every doc on its assigned topic._
- Resolve from the code: which docs are hollow, duplicate AGENTS routing, or sit on the wrong topic?

### 5. Is anything stale — describing removed or renamed features? (dimension b — staleness)

Cross-check sibling docs for contradictions on load-bearing facts (paths,
versions, gate lists) and compare `TESTING.md`'s gates to `.github/workflows/`.

- Recommended answer: _no doc describes a removed feature; siblings agree on shared facts._
- Resolve from the code: which statements are stale or mutually contradictory?

### 6. Fresh-eyes coverage — could a new contributor get lost? (dimension a/c)

Read `README → AGENTS → docs/*` cold. Note undefined jargon, missing onboarding
steps, and claims that do not match what `ls` shows at the repo root.

- Recommended answer: _a new contributor can route from README to the right doc without dead ends._
- Resolve from the code: where would a newcomer hit a wall or a wrong turn?

## Output

Follow the shared output skeleton defined in the `project-reviewer` agent.
The skill-specific pieces below slot into that skeleton:

- **Verdict labels**: one of `accurate`, `minor gaps`, `significant gaps`, `misleading`.
- **Per-finding `Location`** — `<file>:<section>`.
- **Per-finding `Observation`** — the doc defect, stated concretely with evidence from the repo.
- **Per-finding `Recommended action`** — one of: update, rewrite, delete, consolidate, document, fix-routing — and the **dimension** it serves: (a) missing canonical, (b) stale/inaccurate vs code, or (c) structural quality.
- **Per-finding `Route to`** — optional, only when the finding belongs to another reviewer's domain.

For an exhaustive audit, also render the Scope enumeration and C1–C12 coverage
table from `project-doc-review-guidelines.md` — a `clean`/`accurate` verdict
requires positive coverage evidence per category, not merely the absence of
findings.

## What this review does not cover

- Code design and over-engineering — that is `project-review-complexity`'s domain.
- Physical file and directory layout — that is `project-review-structure`'s domain.
- Naming and pattern consistency in the code — that is `project-review-consistency`'s domain.
- Test quality and coverage — that is `project-review-tests`'s domain.

## Adversarial stance

Documentation that lies is worse than no documentation: it sends readers down
dead paths confidently. Treat a green validator run as necessary, not
sufficient — scripts catch broken links and missing files, but only reading the
docs against the code catches the confident falsehood. Do not write "docs look
good" while any load-bearing claim is unverified; a clean verdict is earned by
checking, not by the absence of obvious problems.
