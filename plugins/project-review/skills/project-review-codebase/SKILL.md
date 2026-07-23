---
name: project-review-codebase
description: "Read-only codebase review across three dimensions — consistency, structure, architecture — via a multi-agent workflow that dedupes findings across dimensions; reports fixes, never edits."
user-invocable: true
disable-model-invocation: true
argument-hint: "[ultra] [what-to-review]"
---

Read-only codebase review across three dimensions — consistency, structure, and
architecture. Launch the review workflow — do **not** review inline. The
workflow returns a structured report; relay it.

## Run the workflow

1. Parse `$ARGUMENTS` as `[ultra] [what-to-review]`. Both are optional. A leading
   `ultra` token enables the adversarial refutation pass; everything after it is
   **what to review** — a free-form description ("naming across the service
   layer") or a path. Default: the whole codebase. A leading `low`, `medium`, or
   `high` is the docs skill's cost ladder, which this skill does not have — do
   not silently absorb it into the scope; tell the user only `ultra` exists here
   and treat the remainder as the scope.

2. Resolve the install (`$CLAUDE_PLUGIN_ROOT` is not exported to Bash; locate under
   `$HOME`, version-sorted, with `$PWD` covered for dev installs). The glob must stay a
   `*project-review*` **substring** — cached installs live at
   `…/project-review/<version>/skills`, and only a `*` spanning the version segment reaches
   them. Walk candidates newest-first and take the first that actually carries this workflow:

   ```bash
   PLUGIN_DIR=$(find "$HOME/.claude/plugins" "$PWD" -type d -path '*project-review*/skills' 2>/dev/null |
     sort -V | tac | while read -r d; do
       [ -f "${d%/skills}/skills/project-review-codebase/workflows/review-codebase.js" ] && { printf '%s\n' "${d%/skills}"; break; }
     done)
   SKILL_DIR="$PLUGIN_DIR/skills/project-review-codebase"
   [ -n "$PLUGIN_DIR" ] || echo "skill not located — do not launch; fall back to a manual review"
   ```

3. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflows/review-codebase.js`
   - `args`: `{ "repoRoot": "<repo root, or the step-1 path>", "scope": "<the step-1 what-to-review, or empty>", "vocabFile": "<SKILL_DIR>/references/design-vocabulary.md", "ultra": <true if the ultra token was given> }`
   - The workflow fans out one adversarial read-only agent per dimension
     (consistency, structure, architecture), then a synthesis stage dedupes and
     reconciles findings across dimensions. With `ultra`, every finding first
     passes an adversarial refutation gate; findings that fail are dropped.

4. Relay the report. The workflow returns
   `{ report: { verdict, dimension_verdicts, headline, findings[], recommended_actions[], … }, raw, … }`
   — surface `.report` including the prioritised `recommended_actions`, and do
   not re-derive or re-label it. For a "did you really check X?" follow-up,
   **re-run the skill**; never answer from the report alone.

If the Workflow tool is unavailable or the workflow cannot launch, run the three
dimension procedures inline yourself — they are embedded in
`workflows/review-codebase.js`; read them from there — and state that the
workflow did not run.

## Not covered

Documentation accuracy and staleness → `project-review-docs`; test quality →
`project-review-tests`; pure formatting → linters. Challenging a single design
decision interactively is `challenge:kiss` — the architecture dimension here is
its audit-mode counterpart, not a replacement.
