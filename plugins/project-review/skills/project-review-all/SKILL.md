---
name: project-review-all
description: "Run the full project review — orchestrate the dimension reviewers, verify each finding, and deliver one prioritized action list."
user-invocable: true
disable-model-invocation: true
argument-hint: "[low|medium|high] [dimensions] [what-to-review]"
---

# Orchestrated full project review

This is the umbrella over the `project-review-*` family. It runs the dimension
reviewers, **verifies** every finding adversarially, resolves cross-dimension
hand-offs, and returns **one** prioritized action list — instead of leaving you to
run five skills and merge five reports by hand.

It is user-invoked only (it can spawn a dozen-plus agents — too costly to
auto-trigger). For a single quick lens, the standalone `project-review-<aspect>`
skill is cheaper; this skill is the deliberate, verified, whole-project pass.

## 1. Parse the invocation

`$ARGUMENTS` is `[low|medium|high] [dimensions] [what-to-review]`, positional, all
optional:

- **cost** — a **leading** `low` | `medium` | `high` token. Default: **`high`**.
  - `low` — Find → Verify; report **CONFIRMED only** (fewest, highest-confidence).
  - `medium` — Find → Verify; report CONFIRMED + PLAUSIBLE.
  - `high` — Find → Verify → **Sweep**; report CONFIRMED + PLAUSIBLE (broadest recall).
  - `ultra` is **not accepted here**. It means "the reviewer verifies its own findings",
    which this skill already does in its Verify phase — with an independent verifier,
    which is strictly better. If the user passes it, clamp to `high` and say so in the
    report header.
- **dimensions** — a comma- or space-separated subset of
  `consistency,docs,structure,tests`. Default: **all four**.
- **what to review** — a path or free-form description (e.g. `src/`, "the auth
  module"). Default: **the whole project**.

Only a bare cost token in **first position** is read as the cost; anything else is a
dimension list or, failing that, what to review. The cost is forwarded to every
dimension.

## 2. Run the review workflow

Take the script below, fill in its config constants from your step-1 parsing, and run
it **via the Workflow tool** (pass it as `script`). These constants are the single
configuration point — set them directly; do **not** rely on the Workflow `args` global
(it is not guaranteed to reach the script):

- `DIMS`, `COST` — from step 1.
- `SCOPE` — the scope text, written as a **properly escaped JS string literal** (escape
  any `'` or `\`, e.g. `'the auth module\'s tests'`), or a stray quote breaks the script.
- `PLUGIN_DIR` — the absolute path of *this* plugin, so finders can locate each
  dimension's procedure and workflow-backed dimensions can locate their script. Resolve
  it in the main loop with the house recipe (version-sorted so a newer cached copy wins,
  `$PWD` covered for dev installs), and paste the absolute path.

  The glob must stay a `*project-review*` **substring** — cached installs live at
  `…/project-review/<version>/skills`, and only a `*` spanning the version segment reaches
  them. That breadth also matches a long-dead `project-review` plugin still sitting in the
  cache, so walk candidates newest-first and take the first one that actually carries this
  skill; the marker file, not the glob, is what rejects the impostor:

  ```bash
  PLUGIN_DIR=$(find "$HOME/.claude/plugins" "$PWD" -type d -path '*project-review*/skills' 2>/dev/null |
    sort -V | tac | while read -r d; do
      [ -f "${d%/skills}/skills/project-review-all/SKILL.md" ] && { printf '%s\n' "${d%/skills}"; break; }
    done)
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  ```

  Leaving `PLUGIN_DIR` empty makes prose finders fall back to a best-effort search and
  fail loudly if they still can't find the procedure; workflow-backed dimensions cannot
  fall back and are reported as **not run**.
- `REPO_ROOT` — the absolute repo root from the snippet above. Workflow-backed
  dimensions need a real directory; the script has no filesystem access to derive one.

**Two kinds of dimension.** A *prose* dimension (`consistency`,
`structure`, `tests`) is a procedure document: a `project-review:project-reviewer`
agent reads its `SKILL.md` and follows it. A *workflow-backed* dimension (`docs`) is a
multi-agent pipeline that a single agent cannot reproduce — it is invoked with the
`workflow()` hook and its report is adapted into the shared finding shape. Never hand a
workflow-backed dimension's `SKILL.md` to an agent as a procedure; that file is a
launcher, not a review. Verifiers (on a cheaper model) then try to **refute** every
finding from either kind.

Workflow-backed dimensions are always invoked below `ultra`, because this skill's own
Verify phase is what `ultra` would duplicate.

If the Workflow tool is unavailable in this session, run the prose stages by hand by
spawning subagents (one `project-reviewer` per dimension for Find, one per finding for
Verify, and — only at `high` — one per dimension for Sweep), then apply the same
synthesis (drop REFUTED, fold `route_to`, dedup, sort) before rendering. Workflow-backed
dimensions cannot be run this way: report them as **not run** and tell the user to run
their standalone skill (e.g. `/project-review-docs`) directly.

```js
export const meta = {
  name: 'project-review-all',
  description: 'Full project review: fan out dimension reviewers → verify each finding → synthesize one prioritized list',
  phases: [
    { title: 'Find', detail: 'one reviewer per dimension' },
    { title: 'Verify', detail: 'adversarial refute-vote per finding' },
    { title: 'Sweep', detail: 'fresh gap-finder per dimension (high tier only)' },
  ],
}

// ─── CONFIG — the skill fills these in (steps 1-2) before running. Defaults below
//     = a full, whole-project, high-cost review. ───────────────────────────────
const DIMS = ['consistency', 'docs', 'structure', 'tests']
const SCOPE = '' // a path/description to scope the review; '' = whole project
const RAW_COST = 'high' // 'low' | 'medium' | 'high'
const PLUGIN_DIR = '' // absolute path of the project-review plugin; '' = finders search
const REPO_ROOT = '.' // absolute repo root; workflow-backed dimensions need a real dir
// ─────────────────────────────────────────────────────────────────────────────
const SCOPE_TEXT = SCOPE || 'the whole project at the current working directory'
// 'ultra' means "the reviewer verifies itself" — this skill's Verify phase already
// does that, so it is never forwarded. Clamp defensively in case step 1 let it through.
const COST = RAW_COST === 'ultra' ? 'high' : RAW_COST

// Dimensions whose review is a multi-agent pipeline, not a procedure document. A single
// finder agent cannot reproduce these — invoke the script with the workflow() hook.
const WORKFLOW_DIMS = {
  docs: { script: '/skills/project-review-docs/workflows/review-docs.js', scripts: '/skills/project-review-docs/scripts' },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          location: { type: 'string' },
          observation: { type: 'string' },
          why_it_matters: { type: 'string' },
          recommended_action: { type: 'string' },
          route_to: { type: 'string' },
        },
        required: ['location', 'observation', 'why_it_matters', 'recommended_action', 'route_to'],
      },
    },
  },
  required: ['verdict', 'findings'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vote: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'REFUTED'] },
    evidence: { type: 'string' },
  },
  required: ['vote', 'evidence'],
}

// The `*project-review*` substring is required to reach versioned cache installs, and it
// also matches a long-dead `project-review` plugin still in the cache — whose dimension
// procedures are the WRONG generation. So walk candidates newest-first and take the first
// whose install also carries project-review-all; never merely the newest candidate.
const locate = (dim) =>
  `SKILL="${PLUGIN_DIR}/skills/project-review-${dim}/SKILL.md"; ` +
  `[ -f "$SKILL" ] || SKILL="$(find "$HOME/.claude/plugins" "$PWD" -path "*project-review*/skills/project-review-${dim}/SKILL.md" 2>/dev/null | sort -V | tac | while read -r f; do s=$(dirname "$(dirname "$f")"); [ -f "$s/project-review-all/SKILL.md" ] && { printf '%s\\n' "$f"; break; }; done)"`

function finderPrompt(dim) {
  return [
    `You are the "${dim}" reviewer in project-review's orchestrated full review.`,
    `Review the TARGET REPOSITORY at the current working directory — NOT the project-review plugin.`,
    ``,
    `PROCEDURE — locate this dimension's own review procedure and follow it exactly:`,
    `  ${locate(dim)}`,
    `If "$SKILL" is empty or that file is missing, STOP — return verdict "error" and a`,
    `single finding stating the ${dim} procedure file could not be located; do NOT improvise`,
    `a review without it. Otherwise read that SKILL.md and any references/ files it points`,
    `to, then run its interrogation/verdict procedure and use its verdict label set. Explore`,
    `the real code/docs first (Read, Grep, git) — never judge before seeing the evidence.`,
    ``,
    `REVIEW SCOPE: ${SCOPE_TEXT}. Where the SKILL.md references its $ARGUMENTS`,
    `placeholder, this REVIEW SCOPE is that value.`,
    `COST: ${COST}. Apply ONLY that rung's evidence bar, as defined in the Cost section`,
    `of your agent definition. Do NOT run its sweep or self-refutation passes: this`,
    `orchestrator runs a Sweep phase and an adversarial Verify pass over every finding.`,
    `Cost never softens the verdict.`,
    ``,
    `Return the schema. "verdict" is ONLY the single label from this dimension's set`,
    `(e.g. "approve with concerns", "needs work", "minor drift") — nothing else; put ALL`,
    `detail, including any principle/open-question notes, into the findings array.`,
    `"findings" is empty if genuinely clean — do not pad. Every finding cites an exact`,
    `path and line where possible. Set route_to to another dimension`,
    `(consistency|docs|structure|tests) ONLY when the finding truly belongs to`,
    `that reviewer's remit; otherwise set route_to to "".`,
  ].join('\n')
}

function verifyPrompt(f) {
  return [
    `You are a single adversarial VERIFIER in a project review. Judge ONE finding against`,
    `the real code/docs in the target repo at the current working directory. Read the cited`,
    `location and gather what you need (Read, Grep, git). Be skeptical — REFUTE unless the`,
    `evidence clearly holds.`,
    ``,
    `DIMENSION: ${f.dimension}`,
    `FINDING:`,
    JSON.stringify(
      { location: f.location, observation: f.observation, why_it_matters: f.why_it_matters, recommended_action: f.recommended_action },
      null,
      2,
    ),
    ``,
    `Vote exactly one:`,
    `- CONFIRMED: verified real at the cited location. For structure/tests, name`,
    `  the concrete cost or failure; for docs/consistency, confirm the cited rule, divergence,`,
    `  or inaccuracy actually exists. Quote the proving line in evidence.`,
    `- PLAUSIBLE: the mechanism is real but you could not fully confirm the trigger or cost.`,
    `- REFUTED: factually wrong, already handled, or not present at the cited location. Quote`,
    `  the line that disproves it.`,
  ].join('\n')
}

function sweepPrompt(dim, known) {
  const already = known.filter((f) => f.dimension === dim).map((f) => ({ location: f.location, observation: f.observation }))
  return [
    `You are a fresh "${dim}" SWEEP reviewer. A first pass already produced the findings`,
    `listed below. Re-examine the target repo for ${dim} problems the first pass MISSED.`,
    `Do not repeat anything already listed; if nothing new, return an empty findings array.`,
    ``,
    `PROCEDURE: ${locate(dim)} ; read and follow it.`,
    `REVIEW SCOPE: ${SCOPE_TEXT}.`,
    `ALREADY FOUND (do not repeat): ${JSON.stringify(already)}`,
    ``,
    `Return the schema (same finding shape, including route_to).`,
  ].join('\n')
}

const finderOpts = (dim, ph) => ({ label: `find:${dim}`, phase: ph, agentType: 'project-review:project-reviewer', schema: FINDINGS_SCHEMA })
const verifyOpts = (f) => ({ label: `verify:${f.dimension}`, phase: 'Verify', agentType: 'project-review:project-reviewer', model: 'sonnet', schema: VERIFY_SCHEMA })

// ---- Find -----------------------------------------------------------------
phase('Find')

// A prose dimension: one agent reads the dimension's SKILL.md and follows it.
const runProseDim = (d) =>
  agent(finderPrompt(d), finderOpts(d, 'Find')).then((r) => ({
    dim: d,
    verdict: (r && r.verdict) || 'unknown',
    findings: ((r && r.findings) || []).map((f) => ({ ...f, dimension: d })),
  }))

// A workflow-backed dimension: run its pipeline, adapt its report into the shared
// finding shape. Failures return verdict 'error' so they land in notRun with a reason
// rather than vanishing — a dimension that did not run is never silently dropped.
async function runWorkflowDim(d) {
  const cfg = WORKFLOW_DIMS[d]
  const fail = (why) => ({ dim: d, verdict: 'error', findings: [{ location: d, observation: why }] })
  if (!PLUGIN_DIR) return fail(`${d}: PLUGIN_DIR unresolved — its workflow could not be located`)
  let out
  try {
    out = await workflow({ scriptPath: PLUGIN_DIR + cfg.script }, { repoRoot: REPO_ROOT, scriptsDir: PLUGIN_DIR + cfg.scripts, cost: COST })
  } catch (e) {
    return fail(`${d}: workflow failed — ${String(e)}`)
  }
  const rep = out && out.report
  if (!rep) return fail(`${d}: workflow returned no report`)
  return {
    dim: d,
    verdict: rep.verdict || 'unknown',
    notes: { cross_file: rep.cross_file_notes || '', execution: rep.execution_summary || '' },
    findings: (rep.findings || []).map((f) => ({
      location: f.file,
      observation: f.observation,
      why_it_matters: f.why_it_matters,
      recommended_action: f.recommended_action,
      route_to: '',
      severity: f.severity,
      dimension: d,
    })),
  }
}

const found = await parallel(DIMS.map((d) => () => (WORKFLOW_DIMS[d] ? runWorkflowDim(d) : runProseDim(d))))
const okFound = found.filter(Boolean)
// A dimension is "not run" when its finder thunk rejected or returned verdict "error"
// (procedure not located). Track these explicitly — never silently drop a dimension.
const notRun = DIMS.filter((d) => !okFound.some((r) => r.dim === d)).map((d) => ({ dim: d, reason: 'finder failed' }))
for (const r of okFound.filter((r) => r.verdict === 'error'))
  notRun.push({ dim: r.dim, reason: (r.findings[0] && r.findings[0].observation) || 'procedure not located' })
if (notRun.length) log(`find: NOT RUN — ${notRun.map((f) => f.dim).join(', ')}`)
const okDims = okFound.filter((r) => r.verdict !== 'error')
const ranDims = okDims.map((r) => r.dim)
const verdicts = {}
for (const r of okDims) verdicts[r.dim] = r.verdict
// Prose notes a workflow-backed dimension produced that do not fit the finding shape.
const notes = {}
for (const r of okDims) if (r.notes) notes[r.dim] = r.notes
let candidates = okDims.flatMap((r) => r.findings)
log(`find: ${candidates.length} candidate findings across ${ranDims.length} dimension(s)`)

// ---- Verify ---------------------------------------------------------------
async function verifyAll(items) {
  return (
    await parallel(
      items.map((f) => () =>
        agent(verifyPrompt(f), verifyOpts(f)).then((v) => (v ? { ...f, vote: v.vote, evidence: v.evidence } : null)),
      ),
    )
  ).filter(Boolean)
}

// Fold route_to: reassign a finding's dimension when it routes to another reviewer
// that is part of this run (the one cross-dimension merge). Applied BEFORE Sweep so the
// sweep "already found" lists are bucketed by each finding's final dimension.
const inRun = new Set(DIMS)
function foldRoutes(items) {
  for (const f of items) {
    const rt = (f.route_to || '').replace(/^project-review-/, '').trim()
    if (rt && inRun.has(rt)) f.dimension = rt
  }
  return items
}

// Every finding is verified here, including those from workflow-backed dimensions:
// they are never run at 'ultra', so nothing has verified itself upstream.
phase('Verify')
let kept = foldRoutes((await verifyAll(candidates)).filter((f) => f.vote !== 'REFUTED'))
if (COST === 'low') kept = kept.filter((f) => f.vote === 'CONFIRMED')
log(`verify: ${kept.length} survived (${COST === 'low' ? 'CONFIRMED only' : 'CONFIRMED + PLAUSIBLE'})`)

// ---- Sweep (high only) ----------------------------------------------------
if (COST === 'high') {
  phase('Sweep')
  // A sweep agent works by re-reading the dimension's SKILL.md procedure, so it only
  // applies to prose dimensions. Recall for a workflow-backed dimension is governed by
  // the cost rung already forwarded into its own pipeline.
  const sweepDims = ranDims.filter((d) => !WORKFLOW_DIMS[d])
  const skipped = ranDims.filter((d) => WORKFLOW_DIMS[d])
  if (skipped.length) log(`sweep: not sweeping ${skipped.join(', ')} — workflow-backed; recall set by cost=${COST}`)
  const sweepFound = (
    await parallel(
      sweepDims.map((d) => () =>
        agent(sweepPrompt(d, kept), { label: `sweep:${d}`, phase: 'Sweep', agentType: 'project-review:project-reviewer', schema: FINDINGS_SCHEMA }).then(
          (r) => ((r && r.findings) || []).map((f) => ({ ...f, dimension: d })),
        ),
      ),
    )
  ).flat()
  const sweepKept = foldRoutes((await verifyAll(sweepFound)).filter((f) => f.vote !== 'REFUTED'))
  log(`sweep: ${sweepFound.length} new candidates → ${sweepKept.length} survived`)
  kept = kept.concat(sweepKept)
}

// ---- Synthesize -----------------------------------------------------------
// route_to was folded before Sweep, so each finding's dimension is final here.

// Dedup: same dimension + location + first words of observation.
function dedupKey(f) {
  const o = (f.observation || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 6).join(' ')
  return `${f.dimension}|${f.location}|${o}`
}
const seen = new Set()
const unique = []
for (const f of kept) {
  const k = dedupKey(f)
  if (seen.has(k)) continue
  seen.add(k)
  unique.push(f)
}

// Sort: dimension priority, then CONFIRMED before PLAUSIBLE.
const dimRank = { structure: 0, tests: 1, consistency: 2, docs: 3 }
const voteRank = { CONFIRMED: 0, PLAUSIBLE: 1 }
unique.sort(
  (a, b) =>
    (dimRank[a.dimension] ?? 9) - (dimRank[b.dimension] ?? 9) ||
    (voteRank[a.vote] ?? 9) - (voteRank[b.vote] ?? 9),
)

return {
  cost: COST,
  clamped: RAW_COST !== COST ? RAW_COST : undefined,
  dimensions: DIMS,
  notRun,
  scope: SCOPE_TEXT,
  verdicts,
  notes,
  counts: { firstPass: candidates.length, reported: unique.length },
  findings: unique,
}
```

## 3. Render the report

From the workflow's return value, present one consolidated review:

1. **Scope & cost** — one line: dimensions run, scope, cost. If `clamped` is set, say
   that `ultra` was clamped to `high` and why (this skill verifies findings itself). If
   `notRun` is non-empty, report each listed dimension as **failed / not run** with its
   reason — never present the result as a full review when a dimension is missing. The
   same applies to any requested dimension absent from `verdicts`. When a workflow-backed
   dimension failed, point the user at its standalone skill.
2. **Verdicts** — the per-dimension verdict label from `verdicts` (each dimension
   keeps its own label set: structure `approve`/…/`reject`, tests `passing`/…, etc.).
3. **Findings** — grouped by dimension in the sorted order, each with its
   `Location`, `Observation`, `Why it matters`, `Recommended action`, and the
   verify `vote` (CONFIRMED / PLAUSIBLE). If `notes` carries entries for a dimension
   (a workflow-backed dimension's cross-file or execution summary), render them as a
   short prose note under that dimension's group.
4. **Recommended actions** — one prioritized list across all dimensions, the
   highest-priority items first (the deliverable: it tells the user what to fix first).

This skill is read-only: it reports, it never edits. If a task-creation skill is
present (e.g. `tasks:tasks-create`), close by suggesting the user run it to file
these findings — phrased as something the user does, never an action you take.
