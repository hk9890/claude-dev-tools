---
name: project-review-docs
description: "Read-only audit of a project's docs for accuracy, staleness, gaps, misplaced content, and whether an agent can actually use them — runs a multi-agent workflow, reports fixes, never edits."
user-invocable: true
disable-model-invocation: true
argument-hint: "[low|medium|high|ultra] [what-to-review]"
---

Read-only documentation audit. Launch the review workflow — do **not** review the
docs inline. The workflow returns a structured report; relay it.

## Run the workflow

1. Parse `$ARGUMENTS` as `[low|medium|high|ultra] [what-to-review]`. Both are optional.
   A leading `low` | `medium` | `high` | `ultra` token is the **cost** (default
   `medium`); everything after it is **what to review**. Most invocations pass only a
   cost.

   Unlike the other reviewers, what-to-review here must resolve to a **path** —
   `manifest.py` takes a directory, not a free-form description. Default: the repo root.
   If the argument is a description rather than a path, resolve it to a directory or
   fall back to the root.

2. `SKILL_DIR` is the **base directory for this skill**, given at the top of this file when
   the skill loads. It is absolute and install-correct — build every path below from it.

   Then check the prerequisite and mint a per-run scratch dir. The workflow writes execution
   traces to that dir under deterministic names, and the grading stage treats a trace as
   primary evidence — so two concurrent reviews sharing one directory would grade each
   other's run. Echo the path: shell state does not survive between commands, so a value you
   only assign is gone by the time you need it in step 3.

   ```bash
   command -v python3 >/dev/null || { echo "python3 missing — stop and fall back to a manual read"; return 2>/dev/null || exit 1; }
   SCRATCH=$(mktemp -d /tmp/docreview-XXXXXX) && echo "$SCRATCH" || echo "mktemp failed — stop; do not launch without a scratch dir"
   ```

3. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflows/review-docs.js`
   - `args`: `{ "repoRoot": "<the step-1 path>", "scriptsDir": "<SKILL_DIR>/scripts", "cost": "<the step-1 cost>", "scratchDir": "<the absolute path printed above>" }`
   - `cost` rungs, on top of the per-file read-review that always runs:
     `low` = no execution phase; `medium` = execution on ~3 AGENTS routes;
     `high` = execution on every route; `ultra` = `high` plus an adversarial pass that
     tries to refute each finding and drops the ones that fail.
     Advanced: `"maxExecutionRoutes": <n>` overrides the route cap (`-1` all, `0` skip).
   - The execution phase runs a cold agent **in the live working tree** — so it audits
     your uncommitted doc edits, not `HEAD` — under a hard read-only contract. Tier-C
     (destructive) tasks are never executed.

4. Relay the report. The workflow returns `{ report: { verdict, headline, findings[], … }, raw, … }`
   — surface `.report`, and do not re-derive it. For a "did you really check X?"
   follow-up, **re-run the skill**; never answer from the report alone, and never
   from `grep`/link-checks.

If `python3` is missing or the workflow cannot launch, read every doc in full
against `references/project-setup.md` by hand and state that the workflow did not
run — never report "docs look good" from mechanical checks alone.

## Rubric

`manifest.py` parses `references/project-setup.md` (the canonical doc set and each
file's audience / Inside / Not-inside ownership) and injects each file's contract
inline into the read-review agents, which also load
`references/project-doc-guidelines.md` (authoring rules A1–A10 and prohibitions)
and apply it. `references/project-doc-review-guidelines.md` (the review process)
is maintainer documentation and the manual-fallback rubric; the workflow does not
load it.

Verdict labels: `accurate` · `minor gaps` · `significant gaps` · `misleading`. A
clean `accurate` requires no blocker/major finding and positive coverage — a green
manifest is necessary, never sufficient.

## Not covered

Codebase consistency, layout, and architecture → `project-review-codebase`;
test quality → `project-review-tests`. Challenging a single design decision
interactively → `challenge:kiss`.
