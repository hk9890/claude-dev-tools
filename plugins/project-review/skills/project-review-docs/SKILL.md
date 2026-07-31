---
name: project-review-docs
description: "Read-only audit of a project's docs for accuracy, staleness, gaps, misplaced content, and whether an agent can actually use them — runs a multi-agent workflow, reports fixes, never edits."
user-invocable: true
disable-model-invocation: true
argument-hint: "[low|medium|high|ultra] [path]"
---

Read-only documentation audit. Launch the review workflow — do **not** review the
docs inline. The workflow returns a structured report; relay it.

## Run the workflow

1. Parse `$ARGUMENTS` as `[low|medium|high|ultra] [what-to-review]`. Both are optional.
   A leading `low` | `medium` | `high` | `ultra` token is the **level** (default
   `medium`); everything after it is **what to review**. Most invocations pass only a
   level.

   Unlike the other reviewers, what-to-review here must resolve to a **path** —
   `manifest.py` takes a directory, not a free-form description. Default: the repo root.
   If the argument is a description rather than a path, resolve it to a directory or
   fall back to the root.

2. `SKILL_DIR` is the **base directory for this skill**, given at the top of this file when
   the skill loads. It is absolute and install-correct — build every path below from it.

   The standard this review measures against is **not** in this plugin: the ownership
   contracts and the authoring rules belong to `instruction-writing:writing-project-docs`.
   Load that skill now — the same "Base directory for this skill" line comes with it, and
   that path is `STANDARD_DIR`. Take it from the load; never construct it and never search
   the filesystem for the plugin: a sibling plugin's install directory is not derivable
   from this one's, and a guess selects a stale cached version. If the skill is not installed,
   stop and say so — `project-review` declares it as a dependency, so a missing one means
   a broken install, not an optional extra.

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
   - `args`: `{ "repoRoot": "<the step-1 path>", "scriptsDir": "<SKILL_DIR>/scripts", "standardDir": "<STANDARD_DIR>", "level": "<the step-1 level>", "scratchDir": "<the absolute path printed above>" }`
   - `level` rungs, on top of the per-file read-review that always runs:
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

   If it returns `{ error: … }` and no `report`, the audit did not run: relay the
   error **verbatim**, say so plainly, and do not improvise findings. An error
   carrying `got` means an argument was wrong before any agent was spawned, and
   `got.keys` lists the arguments that actually arrived — surface it, since that is
   what shows a misspelled key.

   Once relayed, offer to decide on the findings via a form: `/html-visualize-ask`
   built from `findings[]` renders a browser HTML question/decision form so they
   can approve/reject each one instead of doing it turn by turn in chat. Only
   offer this if that skill exists; it ships in the separate `html-visualization`
   plugin.

If `python3` is missing or the workflow cannot launch, read every doc in full by
hand against both halves of the standard — `<STANDARD_DIR>/references/project-setup.md`
for what belongs in the file, and `<STANDARD_DIR>/references/project-doc-guidelines.md`
for how it must be written — and state that the workflow did not run. Never report
"docs look good" from mechanical checks alone.

## Rubric

The standard is authored elsewhere and only applied here. `instruction-writing:writing-project-docs`
owns `references/project-setup.md` (the canonical doc set and each file's audience /
Inside / Not-inside ownership), `references/project-doc-guidelines.md` (the six named
rules, the failure modes, and the bar each suggested fix must clear), and the worked
`examples/`. `manifest.py` parses the first and injects each file's contract
inline into the read-review agents, which load the second and apply it.

`references/project-doc-review-guidelines.md` — the review process, the rules to
cite, and severities — stays here: it is maintainer documentation and the manual-fallback
rubric, and the workflow does not load it.

Verdict labels: `accurate` · `minor gaps` · `significant gaps` · `misleading`. A
clean `accurate` requires no blocker/major finding and positive coverage — a green
manifest is necessary, never sufficient.

## Not covered

Codebase consistency, layout, architecture, and test quality →
`project-review-codebase`; empirical test-suite strength →
`project-auto-work:test-tests`. Challenging a single design decision
interactively → `challenge:kiss`. **Writing or fixing the docs** — the file set,
where a piece of content belongs, the worked examples →
`instruction-writing:writing-project-docs`; this skill only audits what is there.
