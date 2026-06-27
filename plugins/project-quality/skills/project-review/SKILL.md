---
name: project-review
description: "Run the full project review — orchestrate the dimension reviewers, verify each finding, and deliver one prioritized action list."
user-invocable: true
disable-model-invocation: true
argument-hint: "[dimensions] [scope] [--low|--medium|--high]"
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

`$ARGUMENTS` carries, in any order and all optional:

- **dimensions** — a comma- or space-separated subset of
  `complexity,consistency,docs,structure,tests`. Default: **all five**.
- **scope** — a path or free-form description of what to review (e.g. `src/`,
  "the auth module"). Default: **the whole project**.
- **tier** — `--low` | `--medium` | `--high`. Default: **`high`**.
  - `--low` — Find → Verify; report **CONFIRMED only** (fewest, highest-confidence).
  - `--medium` — Find → Verify; report CONFIRMED + PLAUSIBLE.
  - `--high` — Find → Verify → **Sweep**; report CONFIRMED + PLAUSIBLE (broadest recall).

Anything that is not a known dimension token or a `--tier` flag is the scope.

## 2. Run the review workflow

Take the script below, fill in its config constants from your step-1 parsing, and run
it **via the Workflow tool** (pass it as `script`). These constants are the single
configuration point — set them directly; do **not** rely on the Workflow `args` global
(it is not guaranteed to reach the script):

- `DIMS`, `TIER` — from step 1.
- `SCOPE` — the scope text, written as a **properly escaped JS string literal** (escape
  any `'` or `\`, e.g. `'the auth module\'s tests'`), or a stray quote breaks the script.
- `PLUGIN_DIR` — the absolute path of *this* plugin, so finders can locate each
  dimension's procedure wherever the plugin is installed. Resolve it in the main loop
  (where `${CLAUDE_PLUGIN_ROOT}` is available), e.g.
  `find ~/.claude/plugins -maxdepth 5 -type d -path '*project-quality' | head -1`, and
  paste the absolute path. Leaving it empty makes finders fall back to a best-effort
  search and fail loudly if they still can't find the procedure.

The finders and verifiers are `project-quality:project-reviewer` agents — finders
load each dimension's own `SKILL.md` procedure from the installed plugin and review
the target repo; verifiers (on a cheaper model) try to **refute** each finding.

If the Workflow tool is unavailable in this session, run the same stages by hand
with the Task tool (one `project-reviewer` per dimension for Find, one per finding
for Verify, and — only at `--high` — one per dimension for Sweep), then apply the
same synthesis (drop REFUTED, fold `route_to`, dedup, sort) before rendering.

```js
export const meta = {
  name: 'project-review',
  description: 'Full project review: fan out dimension reviewers → verify each finding → synthesize one prioritized list',
  phases: [
    { title: 'Find', detail: 'one reviewer per dimension' },
    { title: 'Verify', detail: 'adversarial refute-vote per finding' },
    { title: 'Sweep', detail: 'fresh gap-finder per dimension (high tier only)' },
  ],
}

// ─── CONFIG — the skill fills these in (steps 1-2) before running. Defaults below
//     = a full, whole-project, high-tier review. ───────────────────────────────
const DIMS = ['complexity', 'consistency', 'docs', 'structure', 'tests']
const SCOPE = '' // a path/description to scope the review; '' = whole project
const TIER = 'high' // 'low' | 'medium' | 'high'
const PLUGIN_DIR = '' // absolute path of the project-quality plugin; '' = finders search
// ─────────────────────────────────────────────────────────────────────────────
const SCOPE_TEXT = SCOPE || 'the whole project at the current working directory'

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

const locate = (dim) =>
  `SKILL="${PLUGIN_DIR}/skills/project-review-${dim}/SKILL.md"; ` +
  `[ -f "$SKILL" ] || SKILL="$(find "$HOME/.claude/plugins" "$PWD" -path "*project-quality*/skills/project-review-${dim}/SKILL.md" 2>/dev/null | sort -V | tail -1)"`

function finderPrompt(dim) {
  return [
    `You are the "${dim}" reviewer in project-quality's orchestrated full review.`,
    `Review the TARGET REPOSITORY at the current working directory — NOT the project-quality plugin.`,
    ``,
    `PROCEDURE — locate this dimension's own review procedure and follow it exactly:`,
    `  ${locate(dim)}`,
    `If "$SKILL" is empty or that file is missing, STOP — return verdict "error" and a`,
    `single finding stating the ${dim} procedure file could not be located; do NOT improvise`,
    `a review without it. Otherwise read that SKILL.md and any references/ files it points`,
    `to, then run its interrogation/verdict procedure and use its verdict label set. Explore`,
    `the real code/docs first (Read, Grep, git) — never judge before seeing the evidence.`,
    ``,
    `REVIEW SCOPE: ${SCOPE_TEXT}.`,
    ``,
    `Return the schema. "verdict" is ONLY the single label from this dimension's set`,
    `(e.g. "approve with concerns", "needs work", "minor drift") — nothing else; put ALL`,
    `detail, including any principle/open-question notes, into the findings array.`,
    `"findings" is empty if genuinely clean — do not pad. Every finding cites an exact`,
    `path and line where possible. Set route_to to another dimension`,
    `(complexity|consistency|docs|structure|tests) ONLY when the finding truly belongs to`,
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
    `- CONFIRMED: verified real at the cited location. For complexity/structure/tests, name`,
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

const finderOpts = (dim, ph) => ({ label: `find:${dim}`, phase: ph, agentType: 'project-quality:project-reviewer', schema: FINDINGS_SCHEMA })
const verifyOpts = (f) => ({ label: `verify:${f.dimension}`, phase: 'Verify', agentType: 'project-quality:project-reviewer', model: 'sonnet', schema: VERIFY_SCHEMA })

// ---- Find -----------------------------------------------------------------
phase('Find')
const found = await parallel(
  DIMS.map((d) => () =>
    agent(finderPrompt(d), finderOpts(d, 'Find')).then((r) => ({
      dim: d,
      verdict: (r && r.verdict) || 'unknown',
      findings: ((r && r.findings) || []).map((f) => ({ ...f, dimension: d })),
    })),
  ),
)
const okFound = found.filter(Boolean) // drop any dimension whose finder thunk rejected
const verdicts = {}
for (const r of okFound) verdicts[r.dim] = r.verdict
let candidates = okFound.flatMap((r) => r.findings)
log(`find: ${candidates.length} candidate findings across ${DIMS.length} dimension(s)`)

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

phase('Verify')
let kept = foldRoutes((await verifyAll(candidates)).filter((f) => f.vote !== 'REFUTED'))
if (TIER === 'low') kept = kept.filter((f) => f.vote === 'CONFIRMED')
log(`verify: ${kept.length} survived (${TIER === 'low' ? 'CONFIRMED only' : 'CONFIRMED + PLAUSIBLE'})`)

// ---- Sweep (high only) ----------------------------------------------------
if (TIER === 'high') {
  phase('Sweep')
  const sweepFound = (
    await parallel(
      DIMS.map((d) => () =>
        agent(sweepPrompt(d, kept), { label: `sweep:${d}`, phase: 'Sweep', agentType: 'project-quality:project-reviewer', schema: FINDINGS_SCHEMA }).then(
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
const dimRank = { complexity: 0, structure: 1, tests: 2, consistency: 3, docs: 4 }
const voteRank = { CONFIRMED: 0, PLAUSIBLE: 1 }
unique.sort(
  (a, b) =>
    (dimRank[a.dimension] ?? 9) - (dimRank[b.dimension] ?? 9) ||
    (voteRank[a.vote] ?? 9) - (voteRank[b.vote] ?? 9),
)

return {
  tier: TIER,
  dimensions: DIMS,
  scope: SCOPE_TEXT,
  verdicts,
  counts: { firstPass: candidates.length, reported: unique.length },
  findings: unique,
}
```

## 3. Render the report

From the workflow's return value, present one consolidated review:

1. **Scope & tier** — one line: dimensions run, scope, tier.
2. **Verdicts** — the per-dimension verdict label from `verdicts` (each dimension
   keeps its own label set: complexity `approve`/…/`reject`, tests `passing`/…, etc.).
3. **Findings** — grouped by dimension in the sorted order, each with its
   `Location`, `Observation`, `Why it matters`, `Recommended action`, and the
   verify `vote` (CONFIRMED / PLAUSIBLE).
4. **Recommended actions** — one prioritized list across all dimensions, the
   highest-priority items first (the deliverable: it tells the user what to fix first).

This skill is read-only: it reports, it never edits. If a task-creation skill is
present (e.g. `tasks:tasks-create`), close by suggesting the user run it to file
these findings — phrased as something the user does, never an action you take.
