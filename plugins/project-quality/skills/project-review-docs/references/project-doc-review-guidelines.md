# Review and Validate Project Docs (Read-Only)

Primary entrypoint for the **review/validate without editing** flow.

## Read-only contract (mandatory)

- **No edits:** do not modify docs, source files, configs, or tracker state.
- **Review output only:** return findings, evidence, and suggested fixes.
- **Suggest, never apply:** every finding includes a recommended fix, but applying it is the user's separate, manual step.

Use with:

- [project-setup.md](project-setup.md)
- [project-structure.md](project-structure.md)
- [project-doc-guidelines.md](project-doc-guidelines.md)

## Why this flow is structured

Past reviews kept producing confident "all good" verdicts that only held up under prodding. The root causes were: pass criteria treated "no findings" as "clean" even when whole categories went unchecked; the model halted at "validator scripts green" and wrote a closing summary; and a single-pass single-agent sweep silently dropped categories it never opened.

This procedure addresses that by (a) requiring scope enumeration *before* checks, (b) fanning out into parallel specialist reviewers with disjoint lenses, (c) requiring a self-skeptical second pass, and (d) gating the pass verdict on positive coverage evidence per category — not absence of findings.

## Mandatory workflow

Execute every step in order. Do not skip and do not declare the review complete before Step 5.

### Step 0 — Scope enumeration (always)

Before any check runs, enumerate the surface that will be evaluated and record it in the report's **Scope** section:

- Every top-level directory in the repo (`ls -1` against the repo root).
- Every Markdown file under `docs/**/*.md` and any other doc roots (e.g., `knowledge-base/**/*.md` if present).
- Every workflow file under `.github/workflows/*.yml`.
- Every `package.json` `scripts` block and every `bin` entry.

Each enumerated item must end the review marked as either **in-scope and checked** or **out-of-scope (reason)**. Anything left unmarked is a procedural BLOCKER on the review itself.

### Step 1 — Validator scripts

Run all three. They are necessary but not sufficient.

Run them in **separate, sequential Bash calls — do not batch into one parallel tool-call set**. `claude-md.sh check` exits non-zero on a non-canonical `CLAUDE.md`, and a parallel batch then cancels its siblings, dropping the output from the other two scripts.

- `scripts/claude-md.sh check <repo-root>` — `CLAUDE.md` is exactly `@AGENTS.md` (one line; any extra is BLOCKER).
- `scripts/inventory.py <repo-root>` — missing canonical docs, non-canonical docs, non-canonical subdirs, location violations.
- `scripts/validate-routes.py <repo-root> --include-docs --json` — unresolved file references.

Known coverage gaps the scripts do **not** catch (must be covered by specialist reviewers below):

- Anchor-level link integrity (`file.md#section` may resolve to a missing heading).
- Factual assertions in docs (e.g., a claim "no automated tests" while a `package.json` `test` script exists).
- Undocumented top-level directories (validator only checks docs that exist, not repo surface that should be documented).
- Sibling-doc contradictions (two docs stating the same fact differently).
- Reachability of every `docs/**/*.md` from `AGENTS.md` routing.

### Step 2 — Specialist reviewer fan-out (parallel)

Spawn the specialist reviewers below in **a single message with parallel Agent tool calls**, using `subagent_type=general-purpose`. Each reviewer returns findings in the standard format (see below). They are deliberately narrow — the orchestrator merges and de-duplicates afterward.

Required specialists (run all, every time):

1. **Structural-coverage reviewer** — every top-level dir, every `docs/**/*.md`, every workflow file must be mentioned in at least one canonical doc. Layout/structure blocks in `OVERVIEW.md` and `CODING.md` must match `ls`. Output: list of undocumented dirs/files, list of layout-block omissions.
2. **Factual-claim auditor** — extract every concrete assertion in canonical docs ("no tests", "X is loaded", "Y runs in CI", "only A and B exist") and verify each against repo state via grep/read. Output: list of claims with `verified` / `contradicted-by:<evidence>` status.
3. **Cross-doc consistency reviewer** — for each load-bearing fact (file paths, channel names, version numbers, default URLs, listed merge gates), check that every doc stating it agrees. Output: list of contradictions across sibling docs.
4. **Route reachability reviewer** — for every file under `docs/`, trace whether it is reachable from `AGENTS.md` (directly or via an intermediate canonical doc named in `AGENTS.md`). Output: list of orphaned docs.
5. **Anchor and link integrity reviewer** — for every `[text](path#anchor)` and `[text](path)` in canonical docs, verify the file exists *and* the anchor (if any) resolves to a real heading. Output: list of broken anchors and missing targets.
6. **CI and process inventory reviewer** — compare `TESTING.md`'s merge-gate list to `.github/workflows/*.yml`, and compare any "scripts/tools/skills" list to the actual repo. Output: list of omissions and stale entries in both directions.
7. **Fresh-eyes contributor reviewer** — read `README.md` → `AGENTS.md` → top-level `docs/*.md` cold as a new contributor would. Output: confusion points, undefined jargon, missing onboarding steps, sections whose claims do not match what `ls` shows in the repo root.

Specialist prompt template (use for each):

```
You are reviewing the project docs at <repo-root> with one narrow lens: <specialist-name>.

Your single responsibility: <one-line lens definition from the list above>.

Procedure:
1. Read the relevant canonical docs (AGENTS.md and any docs/ files within your lens).
2. Gather evidence from the repo using read-only commands (ls, grep, cat, git log — no edits).
3. Return findings only within your lens; do NOT branch into other categories.
4. For each finding use the standard format: [SEVERITY] <file>:<section> — <rule-id> — <violation> — <evidence> — <suggested fix>.
5. Also return a one-line coverage statement: "Checked: <what>; Not checked: <what and why>".

Hard rules:
- Read-only. No edits, no commits.
- Do not produce a verdict or top-line summary — leave that to the orchestrator.
- Cap your report at <N> findings; if there are more, return the highest-impact ones and note count.
```

The orchestrator passes a concrete repo root and lens definition into each spawn.

### Step 3 — Self-skeptical second pass

Before writing the headline, the orchestrator must re-walk the **Required coverage categories** table (below) and, for any category not yet positively covered, either run an additional check or move it to **Not checked** with a Tier B/C reason. Cheap (Tier A) checks may not be deferred.

This step exists because every previous review showed the same failure: declaring done after one pass and only finding more under prodding.

### Step 4 — Aggregate, dedupe, classify

Merge specialist outputs. De-duplicate findings that the same defect produced under multiple lenses (cite the strongest evidence). Assign final severity per the rule table.

### Step 5 — Produce the report

Render the report in the exact structure under **Report structure** below.

## Required coverage categories

Every review must produce explicit status for each row. `verified` requires evidence; `findings` requires a count and reference into the findings list; `not-checked` requires a Tier B/C reason. No row may be left blank.

| Category | What it covers | Default tier |
|---|---|---|
| C1 | `CLAUDE.md` is exactly `@AGENTS.md` | A |
| C2 | All routes from `AGENTS.md` resolve to existing files | A |
| C3 | Every `docs/**/*.md` reachable from `AGENTS.md` | A |
| C4 | Every top-level dir mentioned in at least one canonical doc | A |
| C5 | Layout/structure blocks match `ls` for the repo and `docs/` | A |
| C6 | Anchors in inter-doc links resolve to real headings | A |
| C7 | Factual claims in docs match observable repo state | A |
| C8 | No sibling-doc contradictions on load-bearing facts | A |
| C9 | `TESTING.md` merge-gate list matches `.github/workflows/*.yml` | A |
| C10 | Named tools/skills/scripts/packages in docs actually exist in the repo | A |
| C11 | End-to-end runnability of advertised commands (e.g., `release:prepare`) | B |
| C12 | Live external integrations (registries, dashboards, services) | C |

Categories C1–C10 are Tier A — all must be checked. C11/C12 may be deferred with reason.

## Findings format

Return findings as:

`[SEVERITY] <file>:<section> — <rule-id> — <violation> — <evidence> — <suggested fix>`

Severity:

- `BLOCKER`: must-fix correctness or policy violation
- `MAJOR`: high-impact scope/actionability gap
- `MINOR`: clarity/scanability improvement

Rule IDs and default severity:

| Rule | Meaning | Default severity |
|---|---|---|
| `R1` | Repo-local anchor requirement (commands/paths/checklists/decision tables) | MAJOR |
| `R2` | Scan-first structure (short sections, headings, bullets) | MINOR |
| `R3` | Topic boundary (content lives in correct canonical file) | MAJOR |
| `R4` | Skill-aware local delta (no duplicating full skill content) | MAJOR |
| `R5` | Project actionability (commands/paths real and current) | MAJOR |
| `R6` | Factual-assertion correctness (claims match observable repo state) | MAJOR — raise to BLOCKER when the claim materially misleads contributors |
| `R7` | Cross-doc consistency (sibling docs do not contradict each other on load-bearing facts) | MAJOR |
| `R8` | Layout-block completeness (project-structure blocks match `ls`) | MAJOR |
| `R9` | Route reachability (every `docs/` file reachable from `AGENTS.md`) | MAJOR |
| `V1` | Validation coverage (links/anchors/paths resolve) | BLOCKER |

Severity may be raised one level when the violation directly causes wrong behavior in real workflows (e.g., a stale command in `RELEASING.md` is R5/BLOCKER, not R5/MAJOR).

## Report structure (required)

The orchestrator's final report must include the following sections in order. Missing any section is a procedural BLOCKER on the review itself.

1. **Headline** — `Findings: <N> BLOCKER · <N> MAJOR · <N> MINOR — <verdict>` (see verdict rules and headline language constraint below).
2. **Scope** — bulleted enumeration from Step 0, each item tagged in-scope or out-of-scope-with-reason.
3. **Coverage table** — the C1–C12 rows above, each marked `verified: <how>`, `findings: <N> (see #IDs)`, or `not-checked: <reason — Tier B/C only>`.
4. **Findings** — flat list in the standard format, grouped by severity.
5. **Not checked** — items deliberately deferred (Tier B/C only), each with a one-line reason. Tier A items are not permitted here.
6. **Recommended actions** — a prioritised list of suggested fixes, each tagged with its dimension: (a) missing canonical doc, (b) stale/inaccurate vs code, or (c) structural quality (bloat/duplication/misrouting/hollow).

## Headline language constraint

The headline and any closing line must not use the words `done`, `complete`, `all good`, `everything checks out`, or equivalents unless **every** C1–C10 row is `verified` (no `findings`, no `not-checked`). Validator scripts passing alone never justify these words.

When categories are mixed, prefer neutral phrasing: "Findings reported; coverage table attached." A green validator run is reported as "validator scripts pass" — not "done."

## Validation safety model

- **Tier A** (safe/read-only): always run. May not be moved to **Not checked**.
- **Tier B** (expensive but safe): run when needed to verify load-bearing claims. May be deferred with reason.
- **Tier C** (destructive/irreversible): do not execute during routine review; verify indirectly. May be deferred with reason.

## Pass criteria

Review passes (`clean`) when **all** of:

1. No `BLOCKER` findings remain.
2. Every C1–C10 row in the coverage table is `verified` (no `findings`, no `not-checked`).
3. The report includes all required sections (Headline, Scope, Coverage table, Findings, Not checked, Recommended actions).

Other verdicts:

- `minor only` — no BLOCKER or MAJOR, coverage complete on C1–C10.
- `needs work` — MAJOR present, no BLOCKER.
- `fails` — at least one BLOCKER, **or** any C1–C10 row left unchecked despite being Tier A.
- `incomplete` — report is missing a required section; not a content verdict, but the review must be re-run before any verdict is trusted.

## Orchestrator anti-patterns

- Declaring success after only the three validator scripts ran.
- Writing "done"/"complete" in the headline while any C1–C10 row is not `verified`.
- Skipping Step 0 enumeration and only checking what came to mind.
- Skipping Step 3 second-pass and submitting the first-pass report directly.
- Using **Not checked** as a dumping ground for Tier A items the orchestrator did not get to.
- Spawning specialists serially instead of in parallel (slow without benefit).
- Letting one specialist branch outside its lens (produces overlapping noise and misses elsewhere).
