---
name: project-review-docs
description: "Read-only audit of a project's docs for accuracy, staleness, gaps, misplaced content, and whether agents can and do actually use them; runs a multi-agent workflow, reports fixes, never edits."
user-invocable: true
disable-model-invocation: true
argument-hint: "[low|medium|high|ultra] [html-viz] [path]"
---

Read-only documentation audit. Launch the review workflow — do **not** review the
docs inline. The workflow returns a structured report; relay it.

## Run the workflow

1. Parse `$ARGUMENTS` as `[low|medium|high|ultra] [html-viz] [what-to-review]`. All are
   optional, and either leading token stands without the other. A
   `low` | `medium` | `high` | `ultra` token is the **level** (default `medium`) and an
   `html-viz` token puts the open decisions on a browser form in step 5; take both from
   the front of the argument, in either order. Everything left is **what to review**.
   Most invocations pass only a level.

   Unlike the other reviewers, what-to-review here must resolve to a **path** —
   `manifest.py` takes a directory, not a free-form description. Default: the repo root.
   If the argument is a description rather than a path, resolve it to a directory or
   fall back to the root.

2. Load the standard. `SKILL_DIR` is the **base directory for this skill**, given at the top
   of this file when the skill loads. It is absolute and install-correct — build every path
   below from it.

   The standard this review measures against is **not** in this plugin: the ownership
   contracts and the authoring rules belong to `instruction-writing:writing-project-docs`.
   Load that skill now — the same "Base directory for this skill" line comes with it, and
   that path is `STANDARD_DIR`. Take it from the load; never construct it and never search
   the filesystem for the plugin: a sibling plugin's install directory is not derivable
   from this one's, and a guess selects a stale cached version. If the skill is not installed,
   stop and say so — `project-review` declares it as a dependency, so a missing one means
   a broken install, not an optional extra.

   Done when you hold two absolute paths: `SKILL_DIR` and `STANDARD_DIR`.

3. Prepare the run — check the prerequisite, then mint a per-run scratch dir. The workflow
   writes its history extracts and execution traces to that dir under deterministic names,
   and the grading stage treats a trace as primary evidence, so two concurrent reviews
   sharing one directory would grade each other's run. Echo the path: shell state does not
   survive between commands, so a value you only assign is gone by the time you need it in
   step 4.

   ```bash
   command -v python3 >/dev/null || { echo "python3 missing — stop and fall back to a manual read"; return 2>/dev/null || exit 1; }
   ls "<STANDARD_DIR>/references/project-doc-guidelines.md" "<STANDARD_DIR>/references/project-setup.md" "<STANDARD_DIR>/../../references/writing-hygiene.md" >/dev/null || { echo "the standard is incomplete under STANDARD_DIR — stop; the instruction-writing install is broken, and the agents would silently review against fewer rules"; return 2>/dev/null || exit 1; }
   SCRATCH=$(mktemp -d /tmp/docreview-XXXXXX) && echo "$SCRATCH" || echo "mktemp failed — stop; do not launch without a scratch dir"
   ```

   Substitute the step-2 `STANDARD_DIR` value literally — the workflow derives the same three
   paths from it and hands them to agents that never load the skill, so a path that does not
   resolve here dead-ends there.

   Done when the scratch path is printed above. If any command failed, stop here.

4. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflows/review-docs.js`
   - `args`: `{ "repoRoot": "<the step-1 path>", "scriptsDir": "<SKILL_DIR>/scripts", "standardDir": "<STANDARD_DIR>", "level": "<the step-1 level>", "scratchDir": "<the absolute path printed above>" }`
   - `level` rungs, on top of the read-review that always runs — one agent per use case
     (`docs/CODING.md` reviewed by an agent that arrives wanting to code), plus one per
     file that is not a use case:
     `low` = a fast sonnet read-review, history reports coverage only;
     `medium` = opus read-review, history over ~40 sessions;
     `high` = history over every session, plus execution on 3 routes;
     `ultra` = execution on every route.
     Each rung is roughly double the one below it. Execution is what separates the top
     two — it is the only stage costly enough to be worth a rung, since read-review is
     ~84% of a run without it.
     Advanced: `"maxExecutionRoutes": <n>` overrides the execution route cap (`-1` all,
     `0` skip).
   - The history phase reads this repository's past Claude Code sessions and asks whether
     the doc each route points at was actually opened, and opened *before* the work. It
     writes only to the scratch dir. Findings need at least 3 comparable sessions, and a
     session is dropped when the `AGENTS.md` route it ran under has since been reworded —
     that session is evidence about the old route, not the current one. Those dropped
     sessions are still summarised per old wording and reported as superseded-route
     evidence: it never affects a finding or the verdict, but "agents ignored this doc
     under its previous wording" is what shows a rewrite was warranted. A repo with no
     sessions skips the phase: no evidence is a gap in the audit, never a finding about
     the docs.
   - The execution phase (`ultra`) runs a cold agent **in the live working tree** — so it
     audits your uncommitted doc edits, not `HEAD` — under a hard read-only contract.
     Tier-C (destructive) tasks are never executed.

5. Relay the report. The workflow returns `{ report: { verdict, headline, findings[], … }, raw, … }`
   — surface `.report`, and do not re-derive it. Each finding is tagged `settled`
   or `open` — read `<base directory for this skill>/../../references/decision-split.md`
   for what those mean and how to relay them (the plugin-root layout applies, so
   `../..` is correct here). For a "did you really check X?" follow-up, **re-run
   the skill**; never answer from the report alone, and never from
   `grep`/link-checks.

   Report a failed run as a failure. There are two ways to come back without a
   usable report, and both end the same way — say the audit did not complete, and
   improvise nothing:
   - `{ error: … }` and no `report` — relay the error **verbatim**. An error
     carrying `got` means an argument was wrong before any agent was spawned, and
     `got.keys` lists the arguments that actually arrived — surface it, since that
     is what shows a misspelled key.
   - a null or absent `report` with no `error` — the synthesis stage died. Say so
     and offer to re-run; `raw.read_findings` holds unsynthesized per-file output,
     so relay it only as raw material, never as the report.

   Once relayed, follow `../../references/decision-split.md`, which branches on the
   `html-viz` flag from step 1, over the open findings. "the docs audit" is what was
   reviewed. Done when every open item has been put to the user and the settled batch
   has been named.

If `python3` is missing or the workflow cannot launch, read every doc in full by
hand against all three parts of the standard — `<STANDARD_DIR>/references/project-setup.md`
for what belongs in the file, `<STANDARD_DIR>/references/project-doc-guidelines.md`
for how a doc set must be written, and
`<STANDARD_DIR>/../../references/writing-hygiene.md` for the rules binding any document
an agent reads, which the guidelines redirect to rather than restate. That last path
climbs out of the skill because the two `instruction-writing` skills share it at their
plugin root. State that the workflow did not run, and never report "docs look good" from
mechanical checks alone.

## Rubric

The standard is authored elsewhere and only applied here. `instruction-writing:writing-project-docs`
owns `references/project-setup.md` (the canonical doc set and each file's audience /
Inside / Not-inside ownership), `references/project-doc-guidelines.md` (the six named
rules, the doc-set failure modes, and the bar each suggested fix must clear), and the
worked `examples/`. Its plugin root owns `references/writing-hygiene.md` — single source
of truth, cache, relevance, sediment, no-ops, negation — shared with
`instruction-writing:writing-skills`. `manifest.py` parses the setup file and injects each
file's contract inline into the read-review agents, which load the other two and apply both.

`references/project-doc-review-guidelines.md` describes what this review does — its
stages, its severity bar, and the read-only contract each stage runs under. It is
maintainer documentation for changing the workflow, not an input to it: the bars it
describes are inlined in `workflows/review-docs.js`, which is what the agents actually
read.

## Not covered

Codebase consistency, layout, and architecture — including test code →
`project-review-codebase`; empirical test-suite strength →
`project-auto-work:test-tests`. Challenging a single design decision
interactively → `challenge:kiss`. **Writing or fixing the docs** — the file set,
where a piece of content belongs, the worked examples →
`instruction-writing:writing-project-docs`; this skill only audits what is there.
