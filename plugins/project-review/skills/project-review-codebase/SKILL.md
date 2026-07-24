---
name: project-review-codebase
description: "Read-only codebase review across three dimensions — consistency, structure, architecture — via a multi-agent workflow that dedupes findings across dimensions and writes a standalone Markdown report with Mermaid diagrams; reports fixes, never edits."
user-invocable: true
disable-model-invocation: true
argument-hint: "[ultra] [what-to-review]"
---

Read-only codebase review across three dimensions — consistency, structure, and
architecture. Launch the review workflow — do **not** review inline. The workflow
returns a structured report plus a Markdown artifact; relay the report and write
the artifact to a temp file.

## Run the workflow

1. Parse `$ARGUMENTS` as `[ultra] [what-to-review]`. Both are optional. A leading
   `ultra` enables the adversarial refutation pass; the rest is **what to review** —
   a free-form description ("naming across the service layer") or a path. Default:
   the whole codebase. `ultra` is this skill's only depth setting: when the leading
   token is `low`, `medium`, or `high`, say so and take the rest as the scope.

2. `SKILL_DIR` is the **base directory for this skill**, given at the top of this file when
   the skill loads. It is absolute and install-correct — build every path below from it.

3. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflows/review-codebase.js`
   - `args`: `{ "repoRoot": "<repo root, or the step-1 path>", "scope": "<the step-1 what-to-review, or empty>", "vocabFile": "<SKILL_DIR>/references/design-vocabulary.md", "ultra": <true if the ultra token was given> }`
   - The workflow fans out one adversarial read-only agent per dimension
     (consistency, structure, architecture), then a synthesis stage dedupes and
     reconciles findings across dimensions. With `ultra`, every finding first
     passes an adversarial refutation gate; findings that fail are dropped.

4. Relay the report. The workflow returns
   `{ report: { verdict, dimension_verdicts, headline, findings[], recommended_actions[], architecture_candidates[], report_markdown, … }, raw, … }`
   — surface `.report` including the prioritised `recommended_actions`, and do
   not re-derive or re-label it. When `architecture_candidates` is non-empty, list
   the candidates **numbered from 1 in array order** with their title, strength and
   dependency category; that number is how the user selects one. For a "did you
   really check X?" follow-up, **re-run the skill**; never answer from the report
   alone.

5. Write the artifact. If the workflow returned `{ error: … }` instead of a report —
   every dimension failed — there is no `report_markdown`; say the review did not
   complete and **stop here**, do not write a file. Otherwise
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
   — and note the two things they can do with it:
   - **View it rendered** — `/html-visualize-demo <path>` renders the Markdown and
     its Mermaid diagrams in the browser. Only offer this if that skill exists;
     it ships in the separate `html-visualization` plugin.
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
