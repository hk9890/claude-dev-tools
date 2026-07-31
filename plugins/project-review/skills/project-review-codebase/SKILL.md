---
name: project-review-codebase
description: "Read-only codebase review across three dimensions — consistency, structure, architecture — via a multi-agent workflow that dedupes findings across dimensions and writes a standalone Markdown report with Mermaid diagrams; reports fixes, never edits."
user-invocable: true
disable-model-invocation: true
argument-hint: "[low|medium|high|ultra] [what-to-review]"
---

Read-only codebase review across three dimensions — consistency, structure, and
architecture. Launch the review workflow — do **not** review inline. The workflow
returns a structured report plus a Markdown artifact; relay the report and write
the artifact to a temp file.

## Run the workflow

1. Parse `$ARGUMENTS` as `[low|medium|high|ultra] [what-to-review]`. Both are
   optional. A leading `low` | `medium` | `high` | `ultra` token is the **level**
   (default `medium`); everything after it is **what to review** — a free-form
   description ("naming across the service layer") or a path. Default: the whole
   codebase.

2. `SKILL_DIR` is the **base directory for this skill**, given at the top of this file when
   the skill loads. It is absolute and install-correct — build every path below from it.

3. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflows/review-codebase.js`
   - `args`: `{ "repoRoot": "<repo root, or the step-1 path>", "scope": "<the step-1 what-to-review, or empty>", "vocabFile": "<SKILL_DIR>/references/design-vocabulary.md", "level": "<the step-1 level>" }`
   - The workflow fans out one adversarial read-only agent per dimension
     (consistency, structure, architecture), then a synthesis stage dedupes and
     reconciles findings across dimensions. `ultra` is the only rung that changes
     the run, adding an adversarial refutation gate every finding must pass before
     it is reported. `low`, `medium` and `high` are accepted so one depth token
     means the same thing across the audit skills, but they are **not** cheaper
     here — all three run the same three opus dimension agents and the same
     high-effort synthesis. If the user asked for `low` expecting a quick pass,
     say so before launching.

4. Relay the report. The workflow returns
   `{ report: { verdict, dimension_verdicts, headline, findings[], recommended_actions[], architecture_candidates[], report_markdown, … }, raw, … }`
   — surface `.report` including the prioritised `recommended_actions`, and do
   not re-derive or re-label it. When `architecture_candidates` is non-empty, list
   the candidates **numbered from 1 in array order** with their title, strength and
   dependency category; that number is how the user selects one. For a "did you
   really check X?" follow-up, **re-run the skill**; never answer from the report
   alone.

5. Write the artifact. If the workflow returned `{ error: … }` instead of a report
   there is no `report_markdown`: say the review did not complete, relay the error
   **verbatim**, and **stop here** — do not write a file and do not improvise
   findings. Distinguish the two cases rather than guessing: an error carrying
   `got` means the run never started because an argument was wrong, and `got.keys`
   lists the arguments that actually arrived — surface it, since that is what shows
   a misspelled key. An error without `got` means the agents ran and every dimension
   failed. Otherwise
   `report.report_markdown` is the whole review as a standalone Markdown document
   with Mermaid diagrams. Write it **verbatim** — never summarised, reformatted, or
   truncated — to a fresh temp file, then print the path:

   ```bash
   printf '%s\n' "${TMPDIR:-/tmp}/codebase-review-$(date +%Y%m%d-%H%M%S).md"
   ```

   That prints the path — pass the printed value to the Write tool literally. Do
   not assign it to a shell variable and reference it later: each Bash call gets a
   fresh shell, so the variable would be empty by the time you used it. The temp
   directory keeps this clear of the review's read-only contract: **never** write
   it into the user's repository unless they ask for it there.

   Then surface it in one line, e.g.
   `Full report with diagrams: /tmp/codebase-review-20260724-101500.md`
   — and note what they can do with it:
   - **View it rendered** — `/html-visualize-page <path>` renders the Markdown and
     its Mermaid diagrams in the browser. Only offer this if that skill exists;
     it ships in the separate `html-visualization` plugin.
   - **Decide on it** — `/html-visualize-ask` built from the `recommended_actions`
     and any `architecture_candidates` renders a browser HTML form so they can
     approve/reject each one instead of doing it turn by turn in chat. Only offer
     this if that skill exists; it ships in the separate `html-visualization` plugin.
   - **Keep it** — if they want it in the repo, they say where and you copy it.
     Do not pick a location or copy it unprompted.

If the Workflow tool is unavailable or the workflow cannot launch, run the three
dimension procedures inline yourself — they are embedded in
`workflows/review-codebase.js`, along with the artifact format; read them from
there, produce the same Markdown file, and state that the workflow did not run.

## Not covered

Documentation accuracy and staleness → `project-review-docs`; test quality →
`project-review-tests`; pure formatting → linters. Challenging a single design
decision interactively is `challenge:kiss` — the architecture dimension here is
its audit-mode counterpart, not a replacement.

**Implementing a candidate is not part of this skill.** Deepening candidates are
proposals; the review never edits. If the user picks some ("implement 2 and 4"),
that is ordinary follow-up work in the conversation — do it then, not as part of
the review.
