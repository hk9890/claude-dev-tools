export const meta = {
  name: 'project-review-docs',
  description: 'Read-only documentation audit: manifest → per-file read-review → execution test → synthesis',
  whenToUse: 'Launched by the /project-review-docs skill. Audits a project\'s docs for accuracy, boundary/belonging, form, and whether an agent can actually use them.',
  phases: [
    { title: 'Manifest', detail: 'deterministic facts: files, metrics, links, routes' },
    { title: 'Read-review', detail: 'one agent per doc — belongs? accurate? well-formed?' },
    { title: 'Execution', detail: 'per AGENTS route: cold agent does a task, driver grades' },
    { title: 'Verify', detail: 'adversarially refute each finding (cost=ultra only)' },
    { title: 'Synthesis', detail: 'dedupe + cross-file reconciliation + report' },
  ],
}

// args: { repoRoot, scriptsDir, cost?, maxExecutionRoutes? }
// Robust to args arriving as either a parsed object or a JSON-encoded string.
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
A = A || {}
const repoRoot = A.repoRoot
const scriptsDir = A.scriptsDir
// The authoring rules the read-review agents apply live next to the scripts.
const guidelinesFile = scriptsDir ? scriptsDir.replace(/scripts\/?$/, 'references') + '/project-doc-guidelines.md' : ''
// cost bundles the real thoroughness levers: low = read-review only (no execution),
// medium = execution on a few routes, high = every route, ultra = high + a verify
// pass.
const cost = (A.cost || 'medium').toLowerCase()
const COST_ROUTES = { low: 0, medium: 3, high: -1, ultra: -1 }
const maxExec = (A.maxExecutionRoutes !== undefined)
  ? A.maxExecutionRoutes
  : (COST_ROUTES[cost] === undefined ? 3 : COST_ROUTES[cost])
// SKILL.md mints this per run with mktemp. Trace filenames below are deterministic and
// the grading stage treats a trace as primary evidence, so two runs sharing a directory
// grade each other's output — the bare default is safe for one run at a time only.
const scratchDir = A.scratchDir || '/tmp/docreview-scratch'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    coverage: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['belonging', 'accuracy', 'form', 'hollow', 'placement', 'other'] },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          observation: { type: 'string' },
          evidence: { type: 'string' },
          recommended_action: { type: 'string' },
          routes_to: { type: 'string' },
        },
        required: ['category', 'severity', 'observation', 'evidence', 'recommended_action'],
      },
    },
  },
  required: ['file', 'findings'],
}

const TASK_SCHEMA = {
  type: 'object',
  properties: {
    task: { type: 'string' },
    expected: { type: 'string' },
    tier: { type: 'string', enum: ['A', 'B', 'C'] },
    rationale: { type: 'string' },
  },
  required: ['task', 'expected', 'tier'],
}

const ACTION_SCHEMA = {
  type: 'object',
  properties: {
    completed: { type: 'boolean' },
    answer: { type: 'string' },
    docs_consulted: { type: 'array', items: { type: 'string' } },
    commands_run: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cmd: { type: 'string' },
          exit_code: { type: 'integer' },
          output_snippet: { type: 'string' },
        },
        required: ['cmd'],
      },
    },
    obstacles: { type: 'string' },
  },
  required: ['completed', 'answer', 'docs_consulted'],
}

const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    route: { type: 'string' },
    verdict: { type: 'string', enum: ['routed-and-succeeded', 'found-but-insufficient', 'couldnt-route', 'didnt-need-doc', 'inconclusive'] },
    attribution: { type: 'string', enum: ['doc', 'agent', 'environment', 'none'] },
    finding: { type: 'string' },
    severity: { type: 'string', enum: ['none', 'minor', 'major', 'blocker'] },
  },
  required: ['route', 'verdict', 'attribution'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['accurate', 'minor gaps', 'significant gaps', 'misleading'] },
    headline: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          category: { type: 'string' },
          observation: { type: 'string' },
          why_it_matters: { type: 'string' },
          recommended_action: { type: 'string' },
        },
        required: ['file', 'severity', 'observation', 'why_it_matters', 'recommended_action'],
      },
    },
    cross_file_notes: { type: 'string' },
    execution_summary: { type: 'string' },
  },
  required: ['verdict', 'headline', 'findings'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['refuted'],
}

// ---------------------------------------------------------------------------
// Manifest (deterministic facts)
// ---------------------------------------------------------------------------

phase('Manifest')
const manifestText = await agent(
  `Run this exact command and return ONLY its raw stdout — no prose, no markdown fences:\n\n` +
  `python3 "${scriptsDir}/manifest.py" "${repoRoot}" --format=json\n\n` +
  `Do not summarize, do not edit the output. Return the JSON exactly as printed.`,
  { label: 'manifest', phase: 'Manifest', model: 'haiku', effort: 'low' }
)

function parseManifest(text) {
  let t = (text || '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  return JSON.parse(t)
}

let manifest
try {
  manifest = parseManifest(manifestText)
} catch (e) {
  log('FATAL: could not parse manifest JSON — aborting. ' + String(e))
  return { error: 'manifest parse failed', raw: (manifestText || '').slice(0, 400) }
}

log(`Manifest: ${manifest.summary.total_md} docs, ${manifest.summary.canonical_missing} missing canonical, ` +
    `${manifest.summary.unresolved_links} dead links, ${manifest.summary.orphans} orphans, ${manifest.agents_routes.length} routes`)

// ---------------------------------------------------------------------------
// Read-review: one agent per doc
// ---------------------------------------------------------------------------

phase('Read-review')

const reviewFiles = manifest.files.filter(f =>
  f.classification !== 'meta' &&
  f.classification !== 'personal-local' &&
  f.path !== 'CLAUDE.md' // mechanically checked in the manifest
)

function readReviewPrompt(f) {
  const m = f.metrics || {}
  const dead = (f.unresolved_links || []).map(l => `  - L${l.line} ${l.ref} (${l.reason})`).join('\n') || '  (none)'
  const common =
    `Repo root: ${repoRoot}\n` +
    `You are auditing ONE documentation file: ${f.path}\n` +
    `Metrics (from the deterministic manifest — do NOT recompute): ${m.lines} lines, ${m.words} words, ${m.non_heading_lines} content lines.\n` +
    `Links were already resolved by the manifest. Unresolved links in this file:\n${dead}\n\n` +
    `Read the FULL file now, then judge it. You see only THIS file and its contract — there is no doc set to satisfice against.\n` +
    (guidelinesFile
      ? `\nApply the authoring rules — read ${guidelinesFile} once (rules A1–A10 and the hard prohibitions). They define the accuracy, belonging, and form bar; apply them alongside this file's contract.\n`
      : '')

  if (f.contract) {
    const c = f.contract
    return common +
      `\nThis file's ownership contract (the bar for "belongs here"):\n` +
      `  Audience: ${c.audience || '(unspecified)'}\n` +
      `  Inside:   ${c.inside || '(unspecified)'}\n` +
      `  Not inside: ${c.not_inside || '(unspecified)'}\n\n` +
      `For EVERY unit of content — each claim, command, path, table, and section — ask two questions before moving on:\n` +
      `1. TRUE? Verify it against the repo with read-only grep/read (the referenced file/script/flag/command actually exists and matches). A false claim is an accuracy finding.\n` +
      `2. BELONGS HERE? Is it inside this file's Inside boundary? Content that matches Not-inside is a BELONGING finding EVEN IF perfectly accurate (rule A10). Its fix routes the content to the owning file — never "keep it as a subsection here". A file that is largely the wrong genre is a blocker; a localized spill is major.\n\n` +
      `Also judge FORM: is it compact and to-the-point, written for an agent (not narrative human prose, not review-comments/TODO/meta-commentary), and not longer than it needs to be for what it says (${m.lines} lines)? Bloat, hollow sections, or non-agent-facing cruft are form findings.\n\n` +
      `Do not run commands. Read-only. Return findings with concrete evidence (quote the offending lines / cite the repo fact). Empty findings array if the file is genuinely clean — do not invent problems.`
  }
  // Non-standard file: judge placement (does its content belong to a canonical topic?).
  return common +
    `\nThis is a NON-STANDARD doc (not one of the canonical files). Judge placement, not an ownership boundary:\n` +
    `- Does its content actually BELONG to a canonical topic (OVERVIEW / CODING / TESTING / RELEASING / MONITORING / CHANGE-WORKFLOW / RUNNING / REVIEWING / README / CONTRIBUTING)? If so, it is a placement finding: recommend RENAME to docs/<TOPIC>.md when that canonical slot is empty (missing canonical: ${JSON.stringify(manifest.missing_canonical)}), or LINK it from the canonical doc when that slot is filled.\n` +
    `- If it maps to no canonical topic, it is legitimately project-specific — no finding.\n` +
    `- Still flag it if it is hollow (a stub) or duplicates AGENTS.md routing.\n\n` +
    `Read the full file, decide which case applies, and return findings (category 'placement' or 'hollow' or 'other') with evidence. Empty array if it is fine as-is. Read-only.`
}

const reviewResults = await parallel(
  reviewFiles.map(f => () =>
    agent(readReviewPrompt(f), {
      label: `read:${f.path}`,
      phase: 'Read-review',
      model: 'opus',
      schema: FINDINGS_SCHEMA,
    })
  )
)
const readFindings = reviewResults.filter(Boolean)
const readFindingCount = readFindings.reduce((n, r) => n + (r.findings ? r.findings.length : 0), 0)
log(`Read-review: ${readFindings.length}/${reviewFiles.length} docs reviewed, ${readFindingCount} raw findings`)

// ---------------------------------------------------------------------------
// Execution test: does an agent with a task actually succeed via the docs?
// ---------------------------------------------------------------------------

phase('Execution')

// Distinct file routes out of AGENTS.md, mapped to their target doc.
const seenRoute = new Set()
let fileRoutes = manifest.agents_routes.filter(r => {
  if (r.kind === 'skill') return false
  if (!r.target || !r.target.endsWith('.md')) return false
  if (seenRoute.has(r.target)) return false
  seenRoute.add(r.target)
  return true
})

const totalRoutes = fileRoutes.length
if (maxExec === 0) {
  log(`Execution: skipped (cost=${cost}).`)
  fileRoutes = []
} else if (maxExec > 0 && fileRoutes.length > maxExec) {
  log(`Execution: capping at ${maxExec} of ${totalRoutes} routes (cost=${cost}; use cost=high or maxExecutionRoutes:-1 for all).`)
  fileRoutes = fileRoutes.slice(0, maxExec)
}

// Each action agent writes a live trace to a shared scratch file outside the
// repo; the driver grades that trace — the session, not the agent's tidy summary.
const slugify = (s) => s.replace(/[^a-zA-Z0-9]+/g, '_')
const traceFile = (route, i) => `${scratchDir}/exec-${i}-${slugify(route.target)}.md`

const execResults = await pipeline(
  fileRoutes,
  // Stage 1: driver generates a task from the target doc + holds the answer key.
  (route) => agent(
    `Repo root: ${repoRoot}. Read the doc ${route.target} in full.\n` +
    `It is routed from AGENTS.md. Its purpose category is what an agent would come here to do.\n` +
    `Generate ONE realistic task that (a) genuinely requires this doc to complete, (b) is not answerable from general knowledge alone, and (c) a competent agent could attempt now.\n` +
    `The agent who attempts it may not modify the repository, so prefer a task that is completable read-only — "determine X", "report which Y", "run the suite and say what fails" — over one that requires writing a file.\n` +
    `Because you have read the doc, you also hold the correct answer/outcome — record it as the answer key.\n` +
    `Classify the task's safety tier: A = safe/read-only, B = expensive but safe, C = destructive/irreversible (tag/push/publish/delete/prod).\n` +
    `Return {task, expected (the answer key), tier, rationale}.`,
    { label: `gen:${route.target}`, phase: 'Execution', model: 'opus', schema: TASK_SCHEMA }
  ),
  // Stage 2: cold action agent attempts the task — uncoached, in the live repo,
  // so it sees uncommitted doc edits — and appends a live trace to a scratch file.
  (task, route, i) => {
    if (!task) return null
    if (task.tier === 'C') {
      return { _skipped: true, route: route.target, task }
    }
    const tf = traceFile(route, i)
    return agent(
      `Repo root: ${repoRoot}. You have just landed in this repository with a task. Complete it.\n\n` +
      `TASK: ${task.task}\n\n` +
      `You get no hints about how to do it or how hard to try. Work as you normally would. ` +
      `HARD CONSTRAINT — you are working directly in the user's live repository. There is no sandbox and nothing is discarded afterwards, so every side effect is real. Do not create, modify, or delete any file in the repo. Do not change git state (no commit, branch, tag, stash, checkout, push). Do not install packages, publish, or deploy. Reading, searching, and running self-contained commands is fine — a build or test run is allowed, and the untracked cache output it leaves behind is acceptable. The only path you may write to is the trace file below. If finishing the task would require a forbidden step, stop there and report the command you would have run instead of running it.\n\n` +
      `KEEP A LIVE TRACE: run \`mkdir -p ${scratchDir}\` once, then as you work append to ${tf} — this path is outside the repo, so it keeps the repo clean. Log every step: each doc you open (its path), each command with its REAL exit code and a short output snippet, and any obstacle. This trace, not your summary, is what gets graded — make it faithful.\n\n` +
      `When done also return: whether you completed it, your answer/outcome, which docs you consulted, and the commands you ran.`,
      { label: `do:${route.target}`, phase: 'Execution', model: 'sonnet', schema: ACTION_SCHEMA }
    ).then(res => ({ _skipped: false, route: route.target, task, action: res, traceFile: tf }))
  },
  // Stage 3: driver grades the SESSION (the trace file) against its answer key,
  // and independently re-verifies where cheap.
  (run, route, i) => {
    if (!run) return null
    if (run._skipped) {
      return { route: route.target, verdict: 'inconclusive', attribution: 'none',
               finding: 'Task is tier-C (destructive) — not executed; verify by reading.', severity: 'none' }
    }
    const tf = traceFile(route, i)
    return agent(
      `You generated this task from ${route.target} and hold the answer key.\n` +
      `TASK: ${run.task.task}\nEXPECTED (answer key): ${run.task.expected}\n\n` +
      `PRIMARY EVIDENCE — read the action agent's live session trace first: \`cat ${tf}\` (Read/Bash). Grade on what the trace actually shows it did, step by step — not on any tidy summary. If the trace is missing or thin, treat the run as weak evidence and rely on independent verification below.\n` +
      `The action agent (which had ONLY the task, no coaching) also returned:\n${JSON.stringify(run.action, null, 2)}\n\n` +
      `INDEPENDENTLY VERIFY where cheap: re-derive the expected answer yourself from ${route.target} + the repo (read-only), and if the task ran a command, confirm the real outcome rather than trusting a reported exit code.\n\n` +
      `Grade the DOCUMENTATION, not the agent. Verdict:\n` +
      `- routed-and-succeeded: the trace shows it reached ${route.target} via AGENTS.md and got the expected outcome.\n` +
      `- found-but-insufficient: it found the doc but the doc was missing a step / wrong, so it improvised or failed (doc content gap).\n` +
      `- couldnt-route: it could not get from AGENTS.md to the right doc (routing gap).\n` +
      `- didnt-need-doc: it succeeded without consulting the doc — the doc may be redundant with general knowledge.\n` +
      `- inconclusive: failed for a reason NOT attributable to the doc (missing environment/creds/network, or the agent did something dumb) — discard.\n` +
      `Set attribution to doc / agent / environment / none. If there is a documentation finding, state it and its severity; otherwise finding="" severity=none.\n` +
      `Return {route, verdict, attribution, finding, severity}.`,
      { label: `grade:${route.target}`, phase: 'Execution', model: 'opus', schema: GRADE_SCHEMA }
    )
  }
)
const execGraded = execResults.filter(Boolean)
log(`Execution: ${execGraded.length} route(s) graded` + (totalRoutes > fileRoutes.length ? ` (${totalRoutes - fileRoutes.length} not run this pass)` : ''))

// ---------------------------------------------------------------------------
// Verify (cost=ultra) — adversarially refute each read-review finding.
// Reached only when the caller invokes this workflow with cost=ultra.
// ---------------------------------------------------------------------------

let verifiedFindings = readFindings
let refutedFindings = []
if (cost === 'ultra') {
  phase('Verify')
  const flat = []
  for (const r of readFindings) for (const f of (r.findings || [])) flat.push({ file: r.file, ...f })
  const verdicts = (await parallel(flat.map(f => () =>
    agent(
      `Adversarially verify this documentation finding: re-check it against the repo (read-only) and try to REFUTE it. ` +
      `Default refuted=true if the cited evidence does not clearly hold up on inspection.\n\n` +
      `File: ${f.file}\nCategory: ${f.category}\nSeverity: ${f.severity}\nClaim: ${f.observation}\nEvidence cited: ${f.evidence}\n\n` +
      `Return {refuted, reason}.`,
      { label: `verify:${f.file}`, phase: 'Verify', model: 'opus', schema: VERIFY_SCHEMA }
    ).then(v => ({ f, refuted: !!(v && v.refuted), reason: v ? (v.reason || '') : 'no verdict' }))
  ))).filter(Boolean)
  const survivors = verdicts.filter(v => !v.refuted).map(v => v.f)
  refutedFindings = verdicts.filter(v => v.refuted).map(v => ({ file: v.f.file, observation: v.f.observation, reason: v.reason }))
  log(`Verify: ${survivors.length}/${flat.length} findings survived refutation (${refutedFindings.length} dropped)`)
  const byFile = {}
  for (const f of survivors) {
    const { file, ...rest } = f
    if (!byFile[file]) byFile[file] = { file, findings: [] }
    byFile[file].findings.push(rest)
  }
  verifiedFindings = Object.values(byFile)
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

phase('Synthesis')

const report = await agent(
  `You are assembling the final documentation-review report for ${repoRoot}. Be adversarial and honest; a clean verdict must be earned.\n\n` +
  `DETERMINISTIC MANIFEST SUMMARY:\n${JSON.stringify(manifest.summary, null, 2)}\n` +
  `Missing canonical docs: ${JSON.stringify(manifest.missing_canonical)}\n` +
  `Non-standard docs: ${JSON.stringify(manifest.files.filter(f => f.classification === 'non-standard').map(f => f.path))}\n` +
  `Orphans (unreachable from AGENTS.md): ${JSON.stringify(manifest.orphans)}\n` +
  `Location violations: ${JSON.stringify(manifest.location_violations)}\n\n` +
  `PER-FILE READ-REVIEW FINDINGS${cost === 'ultra' ? ' (survived adversarial verification)' : ''}:\n${JSON.stringify(verifiedFindings, null, 2)}\n\n` +
  `EXECUTION-TEST VERDICTS (behavioral: could an agent use the docs?):\n${JSON.stringify(execGraded, null, 2)}\n\n` +
  `Do all of the following:\n` +
  `1. Merge and DEDUPE findings (the same defect surfaced by read-review and execution is ONE finding — cite the strongest evidence).\n` +
  `2. Cross-file reconciliation the per-file agents could not see: sibling contradictions on shared facts; and match any missing canonical doc to a non-standard doc whose content actually IS that topic (rename/link).\n` +
  `3. Fold execution findings in: a 'found-but-insufficient' or 'couldnt-route' verdict is a real doc finding; discard 'inconclusive' (non-doc attribution).\n` +
  `4. Assign an overall verdict: accurate / minor gaps / significant gaps / misleading. A clean 'accurate' requires no blocker/major AND positive coverage — not merely absence of findings.\n\n` +
  `Return the structured object with fields verdict, headline, findings[], cross_file_notes, execution_summary. ` +
  `Each finding's why_it_matters states the concrete cost, risk, or trap the defect creates for someone relying on the doc — not a restatement of the observation. ` +
  `cross_file_notes and execution_summary are separate PLAIN-TEXT prose fields — never write XML/HTML tags, angle-bracket markers, or field names inside their values. ` +
  `Headline must not claim "done/complete/all good" unless there are zero blocker and major findings.`,
  { label: 'synthesis', phase: 'Synthesis', model: 'opus', schema: REPORT_SCHEMA, effort: 'high' }
)

return {
  repoRoot,
  manifest_summary: manifest.summary,
  report,
  raw: {
    cost,
    read_findings: readFindings,
    verified_findings: verifiedFindings,
    refuted: refutedFindings,
    execution: execGraded,
    routes_total: totalRoutes,
    routes_run: fileRoutes.length,
  },
}
