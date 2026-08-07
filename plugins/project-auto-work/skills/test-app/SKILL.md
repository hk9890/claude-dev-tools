---
name: test-app
description: "Exploratory application testing — launches the application, actually uses it, and judges what happened against the project's own user-facing docs and monitoring data. Reports findings, questions and proposals; writes no code and fixes nothing."
user-invocable: true
disable-model-invocation: true
argument-hint: "[low|medium|high|ultra] [html-viz] [focus-or-doc]"
---

Exploratory testing of the application itself — what `test-tests` does to a test suite, this
does to the running product. Launch the workflow; do **not** drive the app inline. The
workflow returns a structured report; relay it and save it to a file.

**This runs the application for real.** Every iteration launches it against whatever
environment it is configured for and uses it as a user would — creating, changing, deleting
and sending real data. The skill applies no safety constraints and cannot: it has no way to
know what the app reaches. Point it at an environment whose data you can afford to lose.

## Run the workflow

1. Parse `$ARGUMENTS` as `[low|medium|high|ultra] [html-viz] [focus-or-doc]`. All optional. A
   leading `low` | `medium` | `high` | `ultra` token is the **level**, and a leading `html-viz`
   token after it puts the open decisions on a browser form in step 5. Everything left is the
   **focus**, in one of three shapes:

   - **absent** — launch the application and exercise it broadly.
   - **an area** ("the export feature") — exercise that part of it.
   - **instructions, or a path to a doc** — do that specifically. A doc is both the scope
     and the yardstick: every claim in it becomes an expectation, and the app disagreeing
     with it is a finding.

   If no level token is given, ask with `AskUserQuestion` (header "Level"):
   - `low` — 2 iterations, documented happy paths only. The rung to pick when you are
     unsure what the environment can absorb.
   - `medium` (recommended) — 4 iterations, plus edge cases and unhappy paths.
   - `high` — 8 iterations, pushing hard: volume, interruption, malformed input.
   - `ultra` — `high`, plus a repro-confirm pass that re-runs each finding in isolation
     and reports whether it happened again. The only rung that runs the app a second
     time to check itself.

   The exact per-level dials live in the workflow's `DIALS` table.

2. `SKILL_DIR` is the **base directory for this skill**, given at the top of this file when
   the skill loads. It is absolute and install-correct — build every path below from it.

3. State what is about to happen, in one line, naming the environment if the project's docs
   identify one: this will launch the application and use it for real, and data may be
   created, changed or deleted. Then create the scratch dir and echo it — shell state does
   not survive between commands, so a value you only assign is gone by the time step 4
   needs it.

   ```bash
   SCRATCH=$(mktemp -d /tmp/test-app-XXXXXX) && echo "$SCRATCH" || echo "mktemp failed — stop; do not launch without a scratch dir"
   ```

4. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflows/test-app.js`
   - `args`: `{ "repoRoot": "<absolute path to the project>", "referencesDir": "<SKILL_DIR>/references", "focus": "<the step-1 focus, or empty>", "level": "<the step-1 level>", "scratchDir": "<the absolute path printed above>" }`

   `referencesDir` must contain `break-it.md` — the workflow hands that path to every
   driver at `medium` and above, so moving or renaming the file silently removes the
   probing instincts from three of the four levels.

   The workflow reads the project's user-facing docs to build a launch contract, a
   monitoring contract and a flow inventory; then runs a serial loop where one agent uses
   the app and reports only what it saw, and a second agent reads that plus the monitoring
   data and decides what it means. It stops at the level's iteration ceiling, or early
   after two iterations that turn up nothing new, or once the findings reach the cap the
   workflow's `FINDINGS_CAP` sets — whichever comes first. Every flow a stop left unreached
   lands in `not_checked`.

5. Relay the report. The workflow returns
   `{ report: { verdict, evidence_basis, headline, findings[], questions[], checked[], not_checked[], proposals[], stop_reason, report_markdown }, raw, … }` —
   surface `.report` in full, and do not re-derive or soften it. Report the `not_checked`
   list as prominently as the findings: a short findings list on a run that reached three
   flows is not a clean bill of health. When the returned object carries a non-null
   `build_drift`, lead with it — the iterations exercised different builds of the
   application, so their findings describe different software.

   Write `report.report_markdown` **verbatim** — never summarised, reformatted, or
   truncated — to `$SCRATCH/test-app-report.md` (outside the project) and state that path.
   For a "did you really check X?" follow-up, **re-run the skill**; never answer from the
   report alone.

   Each proposal is tagged `settled` or `open`, and `questions[]` are open by construction.
   Read `<base directory for this skill>/../../references/decision-split.md` for what those
   mean, how to relay them, and what `html-viz` changes — the plugin-root layout applies, so
   `../..` is correct here.

If the workflow returns an object with `error` and no `report` (bad arguments, or the recon
agent died), relay the error verbatim, state that the run did not happen, and do not
improvise findings. When the error carries `got`, the run never started and `got.keys` lists
the arguments that actually arrived — surface it, since that is what shows a misspelled key.

## The project supplies the technology knowledge

This skill knows nothing about any language, framework or project type, and must not learn
any. Two contracts come from the project's own documentation, discovered the way a user
would find them:

- **How to run it** — the start command, how to tell it is ready, how to stop it. This is a
  hard prerequisite. Undocumented, the run stops before launching anything and returns a
  `not-runnable` report naming exactly what to write down. There is no inference from
  manifests, no project-type guessing, no fallback.
- **How to read its monitoring** — logs, metrics, traces, however this project exposes
  them. Optional. Without it the run still happens, but only surface behaviour is visible:
  the report is marked `surface-only` and says plainly that a failure swallowed into a log
  would not have been seen.

## Expectations come from the docs, never from the code

The agents judge the application against its user-facing documentation and against what a
reasonable user would expect — never against its source. An agent that has read the
implementation measures the app by what the code does, which is true of it by construction,
and stops being able to find a bug at all. The same reasoning excludes the test suite.

One exception: once a failure is already on the record — a crash the driver saw, a stack
trace in a captured log — the analyst may open a source file to explain *where* and *why*
it happened. The code can locate a failure; it can never be the reason something is called
correct.

## Verdicts

`solid` | `rough` | `broken` — earned by what was actually exercised — and `not-runnable`,
which is the abort report with its remediation. Every verdict carries an `evidence_basis`
of `monitoring-backed` or `surface-only`; on a surface-only run the headline says so, so
"nothing broke" is never read as more than "nothing visibly broke".

## Not covered

Reading-based review of the code → `project-review-codebase`. Proving the test suite
detects bugs → `test-tests`. Writing tests or fixing what this finds → out of scope by
design; the report's proposals name the work, you decide what to do with it.
