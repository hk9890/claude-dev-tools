---
name: project-review-docs
description: "Read-only audit of a project's docs for accuracy, staleness, gaps, misplaced content, and whether an agent can actually use them — runs a multi-agent workflow, reports fixes, never edits."
when_to_use: "Use when the user wants a documentation review or audit. Triggers on 'are our docs stale?', 'do our docs match the code?', 'does AGENTS still match the repo?', 'audit the documentation'. Not for complexity, structure, consistency, or test reviews — each has its own skill."
argument-hint: "[low|medium|high] [path]"
---

Read-only documentation audit. Launch the review workflow — do **not** review the
docs inline. The workflow returns a structured report; relay it.

## Run the workflow

1. Parse `$ARGUMENTS`. Both parts are optional and may appear in either order: a bare
   `low` | `medium` | `high` token is the **level** (default `medium`); anything else is
   the **path** to review (default: the repo root). Most invocations pass only a level.

2. Resolve the install (`$CLAUDE_PLUGIN_ROOT` is not exported to Bash; locate under
   `$HOME`, version-sorted, with `$PWD` covered for dev installs):

   ```bash
   command -v python3 >/dev/null || echo "python3 missing"
   PLUGIN_DIR=$(dirname "$(find "$HOME/.claude/plugins" "$PWD" -type d -path '*project-quality*/skills' 2>/dev/null | sort -V | tail -1)")
   SKILL_DIR="$PLUGIN_DIR/skills/project-review-docs"
   [ -f "$SKILL_DIR/workflow/review-docs.js" ] || echo "skill not located — do not launch; fall back to a manual read"
   ```

3. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflow/review-docs.js`
   - `args`: `{ "repoRoot": "<the step-1 path>", "scriptsDir": "<SKILL_DIR>/scripts", "level": "<the step-1 level>" }`
   - `level`: `low` = read-review only, no execution; `medium` = execution on ~3 routes; `high` = all routes plus an adversarial verify pass. Advanced: `"maxExecutionRoutes": <n>` overrides the cap (`-1` all, `0` skip).

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

Code over-engineering → `project-review-complexity`; file/directory layout →
`project-review-structure`; naming/pattern consistency → `project-review-consistency`;
test quality → `project-review-tests`.
