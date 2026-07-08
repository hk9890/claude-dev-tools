---
name: project-review-docs
description: "Read-only audit of a project's docs for accuracy, boundary/belonging, form, and whether an agent can actually use them — reports fixes, never edits."
when_to_use: "Use when the user wants a documentation review or audit. Triggers on 'are our docs stale?', 'do our docs match the code?', 'does AGENTS still match the repo?', 'audit the documentation'. Not for complexity, structure, consistency, or test reviews — each has its own skill. Runs a multi-agent workflow: one reading agent per doc plus a behavioral execution test."
argument-hint: "[what-to-review]"
---

## What this is

A read-only documentation auditor. It does not judge docs by reading alone — it
**runs them**. The audit is a workflow with four stages:

1. **Manifest** (deterministic) — `scripts/manifest.py` enumerates every doc and
   emits the facts: which standard files exist or are missing, per-file line/word/
   byte counts, link and anchor resolution, reachability from `AGENTS.md`, the
   `CLAUDE.md == @AGENTS.md` invariant, hollow docs, and the `AGENTS.md` route
   list. Facts only — no judgment.
2. **Read-review** — one agent per doc. Each sees only *its* file and *its*
   ownership contract (audience / Inside / Not-inside, carried inline from the
   manifest), so it cannot satisfice against the whole set. For every unit of
   content it asks two questions — *is it true?* (verify against the repo) and
   *does it belong here?* (accurate-but-misplaced content is a finding, rule A10)
   — and judges form (compact, agent-facing, not bloated). Non-standard docs are
   judged for placement (is this really a canonical topic, misnamed or unlinked?).
3. **Execution test** — the docs are *used*, not just read. For each `AGENTS.md`
   route, a driver agent generates a realistic task from the target doc (and holds
   the answer key), a **cold, uncoached** action agent attempts it in a throwaway
   git worktree — starting from `AGENTS.md`, told only not to do anything
   destructive — and the driver grades the session against its key: did the doc
   system route the agent to a working answer? Verdicts: routed-and-succeeded /
   found-but-insufficient (content gap) / couldnt-route (routing gap) /
   didnt-need-doc (redundant) / inconclusive (env or agent, discarded).
4. **Synthesis** — merge and dedupe, plus the cross-file reconciliation no
   per-file agent can see (sibling contradictions; a missing canonical doc whose
   content lives in a differently-named file), then the verdict and report.

Scripts do facts; agents do judgment; the workflow orchestrates. There is no
mechanical shortcut for "does this content belong" — that is always a read.

## How to run it

Locate the installed plugin (the scripts and workflow ship with it), then launch
the workflow. `$CLAUDE_PLUGIN_ROOT` is not exported to Bash subprocesses, so
resolve the install under `$HOME` (version-sorted so a newer cached copy wins;
`$PWD` covered for dev installs):

```bash
command -v python3 >/dev/null || echo "python3 missing"
PLUGIN_DIR=$(dirname "$(find "$HOME/.claude/plugins" "$PWD" -type d -path '*project-quality*/skills' 2>/dev/null | sort -V | tail -1)")
SKILL_DIR="$PLUGIN_DIR/skills/project-review-docs"
echo "scripts:  $SKILL_DIR/scripts"
echo "workflow: $SKILL_DIR/workflow/review-docs.js"
```

Then invoke the **Workflow** tool:

- `scriptPath`: `<SKILL_DIR>/workflow/review-docs.js`
- `args`: `{ "repoRoot": "<repo under review>", "scriptsDir": "<SKILL_DIR>/scripts" }`
  - `repoRoot` defaults to the current repo; if `$ARGUMENTS` scopes the review to
    a path, pass that.
  - The workflow caps the execution stage at 3 routes by default; pass
    `"maxExecutionRoutes": -1` in `args` to test every `AGENTS.md` route (slower),
    or a number to set the cap.

The workflow runs in the background and returns a structured report
(`{ verdict, headline, findings[], cross_file_notes, execution_summary }`).
Relay it; do not re-derive it.

If `python3` is missing or the workflow cannot be launched, fall back to reading
every doc in full against `references/project-setup.md` (the ownership
boundaries) by hand — never report "docs look good" from the manifest alone.

## Verdict labels

`accurate` · `minor gaps` · `significant gaps` · `misleading`. A clean `accurate`
requires no blocker/major finding **and** positive coverage — not merely the
absence of obvious problems. A green manifest (links resolve, no missing files)
is necessary, never sufficient: only the read-review and execution stages catch
the confident falsehood and the accurate-but-misplaced section.

## Follow-ups

The workflow reads the docs in its own agents; this conversation does not hold
them afterward. If the user asks "did you really check X?", **re-run the skill**
(or read the specific file against its `project-setup.md` boundary) — do not
answer from the returned report alone, and never from `grep`/link-checks.

## The rubric

The bar the agents apply lives in `references/`:

- [references/project-setup.md](references/project-setup.md) — the canonical doc
  set, file locations, and each file's audience / Inside / Not-inside ownership
  (the source of truth the manifest parses and each read-review agent judges against).
- [references/project-doc-guidelines.md](references/project-doc-guidelines.md) —
  authoring rules (A1–A10) and hard prohibitions the form/belonging checks enforce.

## What this review does not cover

- Code design and over-engineering — `project-review-complexity`.
- Physical file and directory layout — `project-review-structure`.
- Naming and pattern consistency in code — `project-review-consistency`.
- Test quality and coverage — `project-review-tests`.
