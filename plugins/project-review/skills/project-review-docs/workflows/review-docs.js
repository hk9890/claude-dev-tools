export const meta = {
  name: 'project-review-docs',
  description: 'Read-only documentation audit: manifest → per-use-case read-review → history → execution test → synthesis',
  whenToUse: 'Launched by the /project-review-docs skill. Audits a project\'s docs for accuracy, boundary/belonging, form, and whether agents actually use them.',
  phases: [
    { title: 'Manifest', detail: 'deterministic facts: files, metrics, links, routes' },
    { title: 'Read-review', detail: 'one agent per use case, plus the files that are not use cases' },
    { title: 'History', detail: 'did past sessions open the doc their route points at?' },
    { title: 'Execution', detail: 'per AGENTS route: cold agent does a task, driver grades (high = 3 routes, ultra = all)' },
    { title: 'Synthesis', detail: 'dedupe + cross-file reconciliation + report' },
  ],
}

// args: { repoRoot, scriptsDir, standardDir, level?, maxExecutionRoutes?, scratchDir? }

// ---------------------------------------------------------------------------
// Pure helpers — no runtime globals, so they are reachable without launching a
// multi-agent run. Unit-tested via tests/project-review/script-tests/test-review-docs.js.
// ---------------------------------------------------------------------------

// The depth vocabulary is shared with project-review-codebase and test-tests: one
// argument name, one token set, so a token learned at one skill means the same thing
// at the next. Here it bundles the real thoroughness levers.
const LEVELS = ['low', 'medium', 'high', 'ultra']

// Use case -> the doc AGENTS.md routes it to, and the work an agent arrives wanting to do.
// Mirrors USE_CASE_DOCS in scripts/history.py, which owns the classifier's label
// vocabulary. Workflow scripts cannot import shared code, so the two copies are pinned
// against drift by tests/project-review/script-tests/test-history.sh.
const USE_CASES = {
  'searching': { doc: 'docs/OVERVIEW.md', work: 'find your way around the repository — locate code, understand the layout' },
  'coding': { doc: 'docs/CODING.md', work: 'create or edit a file in the source tree' },
  'testing': { doc: 'docs/TESTING.md', work: 'run or write tests, or judge whether a change is verified' },
  'running': { doc: 'docs/RUNNING.md', work: 'launch the product by hand to reproduce a bug or verify a change' },
  'change-workflow': { doc: 'docs/CHANGE-WORKFLOW.md', work: 'commit, branch, push, or open a PR' },
  'reviewing': { doc: 'docs/REVIEWING.md', work: 'review a PR or a diff' },
  'releasing': { doc: 'docs/RELEASING.md', work: 'cut a release' },
  'monitoring': { doc: 'docs/MONITORING.md', work: 'read logs, traces, or usage data' },
}

// What each level buys, as an execution-route budget (0 none, -1 every route).
//
// Read-review always runs — only its model changes, because a rung that costs the same as
// the one above it is a lie the skill then has to explain. History always runs; at low the
// sample is below the finding floor, so it reports coverage only.
//
// Execution is what separates the top two rungs, because it is the only stage expensive
// enough to be worth a rung: measured against three repos, read-review is ~84% of a
// no-execution run, so raising the history sample alone moved high about 4% off medium —
// a rung nobody could feel. A capped probe at high and full coverage at ultra makes each
// step roughly a doubling.
const LEVEL_CONFIG = {
  low: { reviewModel: 'sonnet', sessionLimit: 15, perUseCase: 1, historyFindings: false, executionRoutes: 0 },
  medium: { reviewModel: 'opus', sessionLimit: 40, perUseCase: 3, historyFindings: true, executionRoutes: 0 },
  high: { reviewModel: 'opus', sessionLimit: 0, perUseCase: 5, historyFindings: true, executionRoutes: 3 },
  ultra: { reviewModel: 'opus', sessionLimit: 0, perUseCase: 5, historyFindings: true, executionRoutes: -1 },
}

// A single miss is not a pattern. Below this many valid segments a use case reports
// coverage only — the floor that stops "no evidence" from being read as "bad doc".
const MIN_SEGMENTS_FOR_FINDING = 3

// Normalize the incoming `args` value into the audit's configuration, and reject an
// unusable one here rather than several stages later.
// Defensive: the runtime may hand `args` over as a JSON *string* rather than a parsed
// object (observed in practice). A string has no `.repoRoot`, so reading it directly
// would leave every field undefined and the run would die at the manifest with a
// confusing "undefined/manifest.py" instead of naming the real cause.
function normalizeArgs(rawArgs) {
  let parsed = rawArgs
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = {} }
  }
  parsed = parsed || {}

  const repoRoot = String(parsed.repoRoot || '')
  const scriptsDir = String(parsed.scriptsDir || '')
  // The authoring standard lives in a different plugin, so its path cannot be derived
  // from scriptsDir — SKILL.md loads that skill and passes the base directory the
  // harness printed for it.
  const standardDir = String(parsed.standardDir || '').replace(/\/$/, '')
  const raw = String(parsed.level || '').toLowerCase()
  const level = LEVELS.includes(raw) ? raw : 'medium'

  // Coerce the override to an integer. selectFileRoutes branches on `=== 0` and `> 0`,
  // so a null or a string "0" — which a model filling the args object as JSON text will
  // emit — would satisfy neither test and fall through to "run every route": the caller
  // asks for zero execution routes and instead gets one cold action agent per AGENTS.md
  // route running commands in the live repository.
  let maxExec = LEVEL_CONFIG[level].executionRoutes
  let maxExecError = null
  if (parsed.maxExecutionRoutes !== undefined && parsed.maxExecutionRoutes !== null) {
    const n = Number(parsed.maxExecutionRoutes)
    if (!Number.isInteger(n)) {
      maxExecError = `maxExecutionRoutes must be an integer (got ${JSON.stringify(parsed.maxExecutionRoutes)}) — -1 runs every route, 0 skips the execution phase`
    } else {
      maxExec = n
    }
  }

  // SKILL.md mints this per run with mktemp. Trace filenames below are deterministic and
  // the grading stage treats a trace as primary evidence, so two runs sharing a directory
  // grade each other's output — the bare default is safe for one run at a time only.
  // Require absolute: the execution agent is told to `mkdir -p` this path under a hard
  // read-only contract, on the stated grounds that it sits outside the repo. A relative
  // value — an unsubstituted "<SCRATCH>" placeholder is truthy and would slip past a bare
  // falsy check — would instead create a directory inside the tree being reviewed.
  const scratchDir = String(parsed.scratchDir || '/tmp/docreview-scratch')

  let error = null
  if (parsed.cost !== undefined) {
    // `cost` was renamed to `level`. Accepting it silently would hand a caller who asked
    // for an ultra audit a medium one — capped at 3 routes with no refutation pass — and
    // report raw.level as 'medium' with nothing in the run output saying their requested
    // depth was dropped.
    error = 'the `cost` argument was renamed to `level` — pass "level" with the same value'
  } else if (!repoRoot) {
    error = 'repoRoot is required — it is the directory the manifest and every review agent read'
  } else if (!repoRoot.startsWith('/')) {
    // An unsubstituted "<…>" placeholder from the SKILL.md args template is a non-empty
    // string, so a truthiness check passes it straight to `python3 manifest.py "<…>"`.
    error = `repoRoot must be an absolute path (got ${JSON.stringify(repoRoot)}) — an unsubstituted "<…>" placeholder would otherwise reach the manifest`
  } else if (!scriptsDir) {
    error = 'scriptsDir is required — it locates manifest.py'
  } else if (!scriptsDir.startsWith('/')) {
    error = `scriptsDir must be an absolute path (got ${JSON.stringify(scriptsDir)}) — it is interpolated into the manifest command`
  } else if (!standardDir) {
    error = 'standardDir is required — it is the base directory of the instruction-writing:writing-project-docs skill, which owns the authoring rules and the ownership contracts'
  } else if (!standardDir.startsWith('/')) {
    error = `standardDir must be an absolute path (got ${JSON.stringify(standardDir)}) — load the instruction-writing:writing-project-docs skill and pass the base directory it prints`
  } else if (!scratchDir.startsWith('/')) {
    error = `scratchDir must be an absolute path (got ${JSON.stringify(scratchDir)}) — the execution agent creates it outside the repo`
  } else if (maxExecError) {
    error = maxExecError
  }

  return {
    repoRoot,
    scriptsDir,
    standardDir,
    // Three artifacts of the authoring standard: the doc-set rules every read-review agent
    // applies, the rules that bind any agent-facing document, and the ownership contracts
    // manifest.py parses to attach a boundary to each file. The hygiene file climbs out of
    // the skill to the plugin root because the two instruction-writing skills share it —
    // a review agent is spawned with paths and never loads the skill, so it has to be
    // passed explicitly or the guidelines' redirects to it dead-end.
    guidelinesFile: standardDir + '/references/project-doc-guidelines.md',
    hygieneFile: standardDir + '/../../references/writing-hygiene.md',
    setupFile: standardDir + '/references/project-setup.md',
    level,
    levelConfig: LEVEL_CONFIG[level],
    maxExec,
    scratchDir,
    // Echoed on a bail-out: naming the keys that actually arrived is what lets a caller
    // spot a misspelling, which an error naming only the expected keys cannot.
    receivedKeys: Object.keys(parsed),
    error,
  }
}

// The manifest agent is asked for raw stdout, but models wrap JSON in prose or a fence
// often enough that trusting the request would abort otherwise-good runs. Strip a fence,
// then slice to the outermost braces.
function parseManifest(text) {
  let t = (text || '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  return JSON.parse(t)
}

// Distinct file routes out of AGENTS.md, deduped by target and capped to the level's
// budget. Returns the total before capping so the caller can report what it skipped —
// a silent truncation would read as "every route was exercised".
function selectFileRoutes(agentsRoutes, maxExec) {
  const seen = new Set()
  const distinct = (agentsRoutes || []).filter(r => {
    if (!r || r.kind === 'skill') return false
    if (!r.target || !r.target.endsWith('.md')) return false
    if (seen.has(r.target)) return false
    seen.add(r.target)
    return true
  })
  const total = distinct.length
  if (maxExec === 0) return { routes: [], total }
  if (maxExec > 0 && total > maxExec) return { routes: distinct.slice(0, maxExec), total }
  return { routes: distinct, total }
}

// Split the manifest's reviewable files into the two read-review legs.
//
// A use case is reviewed only when its doc exists: the standard makes every topic doc
// optional and never reports one missing, so an absent doc is a choice rather than a gap.
// Everything else keeps a per-file reviewer, because it is not a use case — README and
// CONTRIBUTING serve humans rather than working agents, AGENTS.md is the router rather
// than any route's destination, and a non-standard doc is judged for placement.
function splitReviewTargets(manifestFiles) {
  const files = (manifestFiles || []).filter(f =>
    f && f.classification !== 'meta' &&
    f.classification !== 'personal-local' &&
    f.path !== 'CLAUDE.md') // mechanically checked in the manifest
  const byPath = new Map(files.map(f => [f.path, f]))
  const useCases = []
  for (const name of Object.keys(USE_CASES)) {
    const spec = USE_CASES[name]
    const file = byPath.get(spec.doc)
    if (file) useCases.push({ useCase: name, doc: spec.doc, work: spec.work, file })
  }
  const claimed = new Set(useCases.map(u => u.doc))
  return { useCases, residual: files.filter(f => !claimed.has(f.path)) }
}

// Probe order for the execution stage: use cases history could not evaluate go first,
// then those it saw skip the doc, then the rest. Uncapped this changes nothing, so it
// costs nothing; capped it spends the expensive stage where there is no evidence yet.
function orderRoutesByHistoryGap(routes, historyByDoc) {
  const rank = (route) => {
    const h = (historyByDoc || {})[route.target]
    if (!h || !h.evaluated) return 0 // no behavioural evidence at all
    if (h.missed) return 1           // evidence, and it showed the doc skipped
    return 2                         // evidence, and it looked fine
  }
  return (routes || []).map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map(x => x.r)
}

// Whether a use case's history evidence can carry a finding at all. Below the floor it
// reports coverage only: one skipped read is an anecdote, and reporting it as a defect
// is how this stage would start crying wolf.
function historyFindingBar(entry, levelConfig) {
  const valid = (entry && entry.coverage && entry.coverage.valid) || 0
  if (!levelConfig || !levelConfig.historyFindings) {
    return { canFind: false, valid, reason: 'coverage-only at this level' }
  }
  if (valid < MIN_SEGMENTS_FOR_FINDING) {
    return { canFind: false, valid, reason: `${valid} valid segment(s); floor is ${MIN_SEGMENTS_FOR_FINDING}` }
  }
  return { canFind: true, valid, reason: `${valid} valid segments` }
}

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
          // Settled or open — the vocabulary is defined once in references/decision-split.md
          // at the plugin root. Without the split, a form built from findings[] asks the
          // maintainer to approve fixing a doc that contradicts the code, spending attention
          // on a question that was never open. The three fields below make an open finding
          // answerable by someone who did not run the audit; JSON Schema cannot make them
          // conditionally required, so the synthesis prompt does.
          decision: { type: 'string', enum: ['settled', 'open'] },
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          recommendation: { type: 'string' },
        },
        required: ['file', 'severity', 'observation', 'why_it_matters', 'recommended_action', 'decision'],
      },
    },
    cross_file_notes: { type: 'string' },
    execution_summary: { type: 'string' },
  },
  required: ['verdict', 'headline', 'findings'],
}

// The classifier writes its labels to a file rather than returning them: history.py
// reads them back, and a few thousand label rows do not belong on a command line. It
// still returns counts so an empty or failed classification is visible in the log
// instead of surfacing later as "no sessions had evidence".
const LABEL_WRITE_SCHEMA = {
  type: 'object',
  properties: {
    labels_file: { type: 'string' },
    sessions_labelled: { type: 'integer' },
    messages_labelled: { type: 'integer' },
    notes: { type: 'string' },
  },
  required: ['labels_file', 'sessions_labelled'],
}

const HISTORY_SCHEMA = {
  type: 'object',
  properties: {
    use_case: { type: 'string' },
    doc: { type: 'string' },
    segments_judged: { type: 'integer' },
    routed: { type: 'integer' },
    late: { type: 'integer' },
    missed: { type: 'integer' },
    not_applicable: { type: 'integer' },
    route_wording: { type: 'string', enum: ['obligation', 'advisory', 'absent'] },
    attribution: { type: 'string', enum: ['doc', 'agent', 'insufficient-evidence', 'none'] },
    severity: { type: 'string', enum: ['none', 'minor', 'major', 'blocker'] },
    finding: { type: 'string' },
    evidence: { type: 'string' },
    // Evidence about a route that has since been reworded. Never a finding about the
    // current text, but it is what tells you whether a rewrite was warranted — and
    // dropping it is how the stage would quietly discard its most useful signal.
    historical_note: { type: 'string' },
  },
  required: ['use_case', 'doc', 'segments_judged', 'routed', 'late', 'missed',
             'route_wording', 'attribution', 'severity'],
}

// Expose the pure helpers to any module loader (the Node unit tests in
// tests/project-review/script-tests use this). Assigned before the orchestration below so
// it is reached whichever path that takes.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeArgs, parseManifest, selectFileRoutes, splitReviewTargets,
    orderRoutesByHistoryGap, historyFindingBar,
    LEVELS, LEVEL_CONFIG, USE_CASES, MIN_SEGMENTS_FOR_FINDING,
  }
}

// ---------------------------------------------------------------------------
// Orchestration — runs only under the Workflow runtime, which injects the `agent`
// hook (plus args/log/parallel/pipeline/phase). Without that hook the runtime
// contract is broken, so we throw rather than silently no-op (see the else).
// ---------------------------------------------------------------------------

if (typeof agent === 'function') {
  const cfg = normalizeArgs(args)
  if (cfg.error) {
    // A bail-out return surfaces to the harness as status:completed, so echo what we
    // received to make the failure diagnosable rather than a silent no-op.
    log(`project-review-docs: ${cfg.error} (args arrived as type "${typeof args}", keys: ${cfg.receivedKeys.join(', ') || 'none'})`)
    return { error: cfg.error, got: { type: typeof args, keys: cfg.receivedKeys, repoRoot: cfg.repoRoot } }
  }

  const { repoRoot, scriptsDir, guidelinesFile, hygieneFile, setupFile, level, levelConfig, maxExec, scratchDir } = cfg

  // ── Manifest (deterministic facts)

  phase('Manifest')
  const manifestText = await agent(
    `Run this exact command and return ONLY its raw stdout — no prose, no markdown fences:\n\n` +
    `python3 "${scriptsDir}/manifest.py" "${repoRoot}" --format=json --setup-md="${setupFile}"\n\n` +
    `Do not summarize, do not edit the output. Return the JSON exactly as printed.`,
    { label: 'manifest', phase: 'Manifest', model: 'haiku', effort: 'low' }
  )

  let manifest
  try {
    manifest = parseManifest(manifestText)
  } catch (e) {
    log('FATAL: could not parse manifest JSON — aborting. ' + String(e))
    return { error: 'manifest parse failed', raw: (manifestText || '').slice(0, 400) }
  }

  log(`Manifest: ${manifest.summary.total_md} docs, ${manifest.summary.canonical_missing} missing canonical, ` +
      `${manifest.summary.unresolved_links} dead links, ${manifest.summary.orphans} orphans, ${manifest.agents_routes.length} routes`)

  // ── Read-review: one agent per doc

  phase('Read-review')

  // The route's own wording, keyed by destination — the use-case agent is judging
  // whether that route delivers it to a doc it can work from.
  const routeText = {}
  for (const r of (manifest.agents_routes || [])) {
    if (r && r.target && !routeText[r.target]) routeText[r.target] = r.text || ''
  }

  const { useCases, residual } = splitReviewTargets(manifest.files)

  // Shared preamble: the deterministic metrics, the authoring rules, and the severity
  // bar. Every read-review agent gets exactly this, whichever leg it belongs to.
  const commonFrame = (f) => {
    const m = f.metrics || {}
    const dead = (f.unresolved_links || []).map(l => `  - L${l.line} ${l.ref} (${l.reason})`).join('\n') || '  (none)'
    return `Repo root: ${repoRoot}\n` +
      `Metrics for ${f.path} (from the deterministic manifest — do NOT recompute): ${m.lines} lines, ${m.words} words, ${m.non_heading_lines} content lines.\n` +
      `Links were already resolved by the manifest. Unresolved links in this file:\n${dead}\n` +
      `\nApply the authoring rules — read ${guidelinesFile} once, all of it: the six named rules (Ownership, Local delta, Anchors, Command register, Economy, Obligation), the failure modes, and the closing bar a change must clear before it lands. The rules define the accuracy, belonging, and form bar for the file; the closing bar is what every fix you recommend must itself clear.\n` +
      `Then read ${hygieneFile}, all of it, and apply it too: single source of truth, cache, relevance, sediment, no-ops and negation bind any document an agent reads, and the guidelines file redirects to it rather than restating it. Both files bind — a finding under either is a finding.\n` +
      // Severity is a required enum on every finding, so leaving the bar unstated does not
      // produce fewer severities — it produces severities assigned from the model's priors,
      // which vary run to run. This is the whole rubric; it has no other home the agent reads.
      `\nSEVERITY — assign every finding against this bar, not by feel:\n` +
      `  blocker: a documented fact or procedure that is wrong, or a doc largely in the wrong genre for its owner — it misleads confidently.\n` +
      `  major:   a real scope, actionability, or belonging gap (a localized out-of-boundary spill, a stale command, a routing gap), or bloat heavy enough to obscure the procedure the file exists to document.\n` +
      `  minor:   clarity, scanability, and economy defects a reader absorbs without being misled.\n` +
      `Raise one level when the defect directly breaks a real workflow — a stale command in RELEASING.md is a blocker, not a minor. Judge Economy by what the bloat costs a reader rather than by line count, and treat minor as its floor, not its ceiling.\n`
  }

  // The per-unit accuracy and belonging pass, shared by any file that has a contract.
  const contractBlock = (f) => {
    const c = f.contract || {}
    return `\nThis file's ownership contract (the bar for "belongs here"):\n` +
      `  Audience: ${c.audience || '(unspecified)'}\n` +
      `  Inside:   ${c.inside || '(unspecified)'}\n` +
      `  Not inside: ${c.not_inside || '(unspecified)'}\n\n` +
      `For EVERY unit of content — each claim, command, path, table, and section — ask two questions before moving on:\n` +
      `1. TRUE? Verify it against the repo with read-only grep/read (the referenced file/script/flag/command actually exists and matches). A false claim is an accuracy finding.\n` +
      `2. BELONGS HERE? Is it inside this file's Inside boundary? Content that matches Not-inside is a BELONGING finding EVEN IF perfectly accurate (the Ownership rule). Its fix routes the content to the owning file — never "keep it as a subsection here".\n\n` +
      `Then judge the file as a whole against the Economy rule — it spends ${(f.metrics || {}).lines} lines on what it says. Apply that rule from the rules file rather than from memory, and raise what fails it as a form finding naming the spans you would cut.\n`
  }

  // Leg 1 — one agent per use case. It arrives wanting to do the work, not to audit a
  // file: the doc has to carry it through the task, and a doc that reads well but leaves
  // the work undoable is the defect this framing catches and a file audit does not.
  const useCasePrompt = (uc) => commonFrame(uc.file) +
    `\nYou are here to ${uc.work}. That is the task; ${uc.doc} is where AGENTS.md sends you for it.\n` +
    `AGENTS.md is always in the agent's context, so treat its route as already read. Its wording for this route is:\n  ${routeText[uc.doc] ? JSON.stringify(routeText[uc.doc]) : '(no route to this doc found in AGENTS.md)'}\n\n` +
    `Read ${uc.doc} in full, then judge it from that seat:\n` +
    `A. COULD YOU DO THE WORK? Walk the task through the doc. Name every point where you would have to guess, leave the doc, or already know something it never states. A gap that stops the work is a blocker; one that slows it is major.\n` +
    `B. Does the route above actually deliver you here at the right moment? A route that names a topic rather than a triggering action, or reads as optional, is an Obligation finding against AGENTS.md — report it with routes_to "AGENTS.md".\n` +
    contractBlock(uc.file) +
    `\nDo not run commands. Read-only. Return findings with concrete evidence (quote the offending lines / cite the repo fact). Empty findings array if the doc genuinely carries the work — do not invent problems.`

  // Leg 2 — the files that are not use cases. README and CONTRIBUTING serve humans,
  // AGENTS.md is the router itself, and a non-standard doc is judged for placement.
  const residualPrompt = (f) => {
    const frame = commonFrame(f) +
      `\nYou are auditing ONE documentation file: ${f.path}. You see only this file and its contract — there is no doc set to satisfice against. Read the FULL file now, then judge it.\n`
    if (f.path === 'AGENTS.md') {
      return frame +
        `\nThis is the routing layer. Judge it as a router: every route an obligation naming the triggering action (the Obligation rule), no procedure that belongs in a destination, and short enough to scan in the first seconds of a task.\n` +
        // Naming an action is necessary but not sufficient. A route can satisfy every
        // written rule and still be unfollowable because the action it names has no first
        // instant. Reading the route is the only way to catch this — the history stage can
        // confirm it, but only where transcripts exist.
        `\nTRIGGER EDGE — apply this to EVERY route, and it is separate from whether the route says MUST:\n` +
        `Ask: is there a single, recognizable instant at which an agent knows it is about to do this? Then decide.\n` +
        `- Has an edge: "before creating or editing ANY file under \`src/\`" (the first Edit on that path), "before ANY git operation" (the first git command), "before cutting a release".\n` +
        `- Has NO edge: "before searching this repository" — searching is not an act with a beginning; an agent greps within seconds of starting and never has a moment where "I am now beginning to search" occurs. Likewise "before judging whether a change is verified", or any trigger phrased as a symptom the agent must first diagnose ("when X will not connect"), which by construction fires only after the work is underway.\n` +
        `An edgeless trigger is an Obligation finding even when the route is a correctly worded MUST: a diligent agent cannot obey it. Severity major. The fix names an action with a detectable first instant — e.g. replace "before searching this repository" with "before your first grep, rg, or Glob in this repo" — and it replaces the existing trigger rather than being added beside it.\n` +
        contractBlock(f) +
        `\nDo not run commands. Read-only. Return findings with concrete evidence. Empty array if it is genuinely clean.`
    }
    if (f.contract) {
      return frame + contractBlock(f) +
        `\nDo not run commands. Read-only. Return findings with concrete evidence (quote the offending lines / cite the repo fact). Empty findings array if the file is genuinely clean — do not invent problems.`
    }
    // A non-standard doc has no ownership contract, but it makes claims about this repo
    // like any other. Asking only "is it filed correctly?" was leaving the accuracy pass
    // to luck: agents did it anyway and it produced a third of the blockers across three
    // trial repos — including a spec that contradicted the coding guide it cited. A more
    // literal run would have obeyed the placement-only brief and dropped them.
    return frame +
      `\nThis is a NON-STANDARD doc — not one of the canonical files, so it has no ownership contract. Judge it on two axes.\n\n` +
      `1. TRUE? This is the main job. For every claim, command, path, flag, and code reference, verify it against the repo with read-only grep/read. A false claim is an accuracy finding at the same severity bar as any canonical doc — and a doc that contradicts a canonical doc, or describes behaviour the code does not implement, is a blocker. Specs and design documents are the highest-risk case: they are written once, read as authoritative, and drift silently as the code moves.\n` +
      `2. FILED CORRECTLY? Does its content belong to a canonical topic (OVERVIEW / CODING / TESTING / RELEASING / MONITORING / CHANGE-WORKFLOW / RUNNING / REVIEWING / README / CONTRIBUTING)? If so, that is a placement finding: recommend RENAME to docs/<TOPIC>.md when that canonical slot is empty (missing canonical: ${JSON.stringify(manifest.missing_canonical)}), or LINK it from the canonical doc when the slot is filled. If it maps to no canonical topic it is legitimately project-specific — no placement finding, which says nothing about whether it is accurate.\n\n` +
      `Also flag it if it is hollow (a stub) or duplicates AGENTS.md routing.\n\n` +
      `Read the full file, then return findings (category 'accuracy', 'placement', 'hollow', or 'other') with concrete evidence — quote the offending line and cite the repo fact that contradicts it. Empty array only if the file is genuinely both accurate and correctly filed. Read-only; do not run commands that change anything.`
  }

  const reviewJobs = [
    ...useCases.map(uc => ({ label: `use-case:${uc.useCase}`, prompt: useCasePrompt(uc) })),
    ...residual.map(f => ({ label: `read:${f.path}`, prompt: residualPrompt(f) })),
  ]

  const reviewResults = await parallel(
    reviewJobs.map(job => () =>
      agent(job.prompt, {
        label: job.label,
        phase: 'Read-review',
        model: levelConfig.reviewModel,
        schema: FINDINGS_SCHEMA,
      })
    )
  )
  const readFindings = reviewResults.filter(Boolean)
  const readFindingCount = readFindings.reduce((n, r) => n + (r.findings ? r.findings.length : 0), 0)
  log(`Read-review: ${useCases.length} use case(s) + ${residual.length} other file(s), ` +
      `${readFindings.length}/${reviewJobs.length} returned, ${readFindingCount} raw findings (${levelConfig.reviewModel})`)

  // ── History: did past sessions in this repo actually open the doc they were routed to?
  //
  // The synthetic probe below asks whether the docs *can* be used. This asks whether they
  // *were* — real evidence, at the cost of being a lagging indicator, which is why every
  // segment is filtered against how much its doc has changed since.

  phase('History')

  const historyDir = `${scratchDir}/history`
  const prompts = await agent(
    `Run this exact command and return ONLY its raw stdout — no prose, no markdown fences:\n\n` +
    `python3 "${scriptsDir}/history.py" prompts "${repoRoot}" --out "${historyDir}" --limit ${levelConfig.sessionLimit}\n\n` +
    `Return the JSON exactly as printed.`,
    { label: 'history:extract', phase: 'History', model: 'haiku', effort: 'low' }
  )

  let promptIndex = null
  try {
    promptIndex = parseManifest(prompts)
  } catch (e) {
    log('History: could not parse the prompt index — skipping the stage. ' + String(e))
  }

  let historyEntries = []
  let historySummary = null
  const batches = (promptIndex && promptIndex.batches) || []

  if (!promptIndex) {
    // already logged
  } else if (!batches.length) {
    log(`History: no session transcripts for this repository (${promptIndex.projects_dir}) — stage skipped.`)
  } else {
    // Classify: one agent per batch, labelling user messages only. Intent is judgment,
    // so no script decides it; the agent writes labels back for history.py to read.
    const labelWrites = await parallel(batches.map((b, i) => () =>
      agent(
        `Read ${b.file}. It holds ${b.sessions} Claude Code session(s) from one repository, each with its user messages in order.\n\n` +
        `Label EVERY message with the kind of work the user was asking for, using exactly one of:\n` +
        Object.keys(USE_CASES).map(u => `  ${u} — ${USE_CASES[u].work}`).join('\n') + `\n  none — anything else (chat, planning, an unrelated topic)\n\n` +
        `Judge intent from the text. A follow-up like "ok do that" or "now fix it" carries no topic of its own — read it in sequence and give it the label of the work it continues. Label "none" only when the message genuinely starts no work of these kinds.\n\n` +
        `Write the result to ${b.labels_file} as JSON, exactly this shape:\n` +
        `{"sessions":[{"session_id":"<id from the input>","labels":[{"turn":<the message's turn number>,"use_case":"<label>"}]}]}\n` +
        `Include every session in the input and every message's turn number unchanged. Then return the file path and the counts.`,
        { label: `history:label-${i + 1}`, phase: 'History', model: 'haiku', schema: LABEL_WRITE_SCHEMA }
      )
    ))
    const labelled = labelWrites.filter(Boolean)
    log(`History: ${labelled.length}/${batches.length} batch(es) classified, ` +
        `${labelled.reduce((n, r) => n + (r.sessions_labelled || 0), 0)} session(s) labelled`)

    // Filter, stratify, and project — all mechanical, so no agent judges any of it.
    const evidenceText = await agent(
      `Run this exact command and return ONLY its raw stdout — no prose, no markdown fences:\n\n` +
      `python3 "${scriptsDir}/history.py" evidence "${repoRoot}" --scratch "${historyDir}" --per-use-case ${levelConfig.perUseCase}\n\n` +
      `Return the JSON exactly as printed.`,
      { label: 'history:evidence', phase: 'History', model: 'haiku', effort: 'low' }
    )
    try {
      historySummary = parseManifest(evidenceText)
    } catch (e) {
      log('History: could not parse the evidence summary — no history findings this run. ' + String(e))
    }

    if (historySummary) {
      const coverage = historySummary.coverage || {}
      // Guard on USE_CASES: the judge prompt dereferences USE_CASES[u].doc, so a key the
      // script emitted but this table does not know would throw mid-stage.
      const judgeable = Object.keys(coverage).filter(u => USE_CASES[u] && (coverage[u].valid || 0) > 0)
      log(`History: ${judgeable.length}/${Object.keys(coverage).length} use case(s) have valid evidence` +
          ` (floor for a finding is ${MIN_SEGMENTS_FOR_FINDING} segments)`)

      historyEntries = (await parallel(judgeable.map(useCase => () => {
        const doc = USE_CASES[useCase].doc
        const bar = historyFindingBar({ coverage: coverage[useCase] }, levelConfig)
        return agent(
          `Read ${historySummary.evidence_file} and work ONLY on the entry whose use_case is "${useCase}" (doc: ${doc}).\n\n` +
          `Each segment is one stretch of a past session doing that kind of work. It carries:\n` +
          `  first_doc_read_turn — when ${doc} was opened, or null if it never was\n` +
          `  first_work_turn — the first write or command in that segment\n` +
          `  writes / commands / other_reads — what the agent actually did\n\n` +
          `Classify every segment: routed (doc opened before first_work_turn), late (opened after it — the standard says loading afterwards does not count as routing), missed (never opened though real work happened), not-applicable (no real work of this kind actually took place; the label was wrong).\n\n` +
          `AGENTS.md is always in an agent's context and is never Read, so its absence from the reads means nothing. The destination doc is the whole signal.\n\n` +
          `The route's wording in AGENTS.md is:\n  ${routeText[doc] ? JSON.stringify(routeText[doc]) : '(no route to this doc found)'}\n` +
          `Classify it as: obligation (a MUST naming the action that triggers it), advisory ("see X", "load X to understand Y", or anything an agent reads as skippable), or absent.\n\n` +
          // A route can be a flawless obligation and still be unfollowable, because naming
          // an action is not the same as there being a moment the agent notices crossing it.
          // Without this test that case is indistinguishable from laziness and gets blamed
          // on the agent forever, so the one defect reading AGENTS.md cannot reveal stays hidden.
          `TRIGGER EDGE — apply this before attributing any miss. For each segment, find the exact turn at which the route's named trigger fired.\n` +
          `- If you can point at one ("turn 213, the first git command" for a route reading "before ANY git operation"), the trigger has a recognizable edge and the agent simply crossed it.\n` +
          `- If no single unambiguous moment exists — the route names something diffuse that has no starting instant, like "before searching this repository" or "before judging whether a change is verified", which an agent is doing continuously and never begins — then the trigger has NO edge. A diligent agent would miss it too.\n` +
          `Set route_wording to "advisory" for an edgeless trigger even when it is phrased as a MUST: it fails the Obligation rule for the same reason an advisory route does, and its fix is the same kind of edit — name an action with a detectable first instant (e.g. "before your first grep/rg/Glob in this repo"). Say so in the finding, and route it to AGENTS.md.\n\n` +
          `ATTRIBUTION — this is the judgment that decides whether the finding is worth anything:\n` +
          `- advisory, edgeless, or absent route + misses => attribution "doc", a real finding against AGENTS.md: the Advisory-route failure mode, now measured rather than guessed. Severity major.\n` +
          `- obligation route WITH a recognizable edge + misses => attribution "agent". The route is written correctly and was skipped anyway; report it at minor as an observation about agent behaviour, NOT as a defect in the doc. A miss here is never evidence the doc is redundant — the agent could not know what the doc contained before opening it.\n` +
          `- everything routed => attribution "none", severity none.\n\n` +
          `EVIDENCE BAR: ${bar.canFind ? `${bar.reason} — a finding is allowed.` : `${bar.reason} — report the counts and set severity "none" and attribution "insufficient-evidence". Do not raise a finding from this sample.`}\n\n` +
          `SUPERSEDED ROUTES — the entry's "historical" array holds segments that ran under an EARLIER wording of this route, summarised as: the old route text, how many segments did real work, and how many opened the doc. These are excluded from every count above because they are not evidence about today's route.\n` +
          `Report them in historical_note anyway, in one or two sentences: quote the old wording and give the ratio, e.g. 'under the previous advisory wording "Load X for guidance", 25 of 25 segments did the work and 4 opened the doc'. This is what shows whether a rewrite was warranted, so state it plainly. If coverage carries historical_truncated, say how many were not examined.\n` +
          `It is NEVER a finding about the current text and must not move severity or attribution. Leave historical_note empty when the array is empty.\n\n` +
          `Never treat "no sessions" or "few sessions" as a defect in the doc. Return the counts, the route classification, and the finding if one is warranted.`,
          { label: `history:${useCase}`, phase: 'History', model: 'sonnet', schema: HISTORY_SCHEMA }
        )
      }))).filter(Boolean)

      const real = historyEntries.filter(h => h.attribution === 'doc' && h.severity !== 'none')
      const superseded = Object.keys((historySummary && historySummary.historical) || {})
      log(`History: ${historyEntries.length} use case(s) judged, ${real.length} doc finding(s)` +
          (superseded.length ? `; superseded-route evidence for ${superseded.length} use case(s) (reported, never a finding)` : ''))
    }
  }

  // ── Execution test: does an agent with a task actually succeed via the docs?

  phase('Execution')

  // Probe the use cases history could not settle first, so a capped run spends its
  // budget where there is no behavioural evidence at all.
  const historyByDoc = {}
  for (const h of historyEntries) {
    historyByDoc[h.doc] = { evaluated: (h.segments_judged || 0) > 0, missed: (h.missed || 0) > 0 }
  }
  const orderedRoutes = orderRoutesByHistoryGap(manifest.agents_routes, historyByDoc)
  const { routes: fileRoutes, total: totalRoutes } = selectFileRoutes(orderedRoutes, maxExec)
  if (maxExec === 0) {
    log(`Execution: skipped (level=${level}).`)
  } else if (fileRoutes.length < totalRoutes) {
    log(`Execution: capping at ${maxExec} of ${totalRoutes} routes (level=${level}; use level=high or maxExecutionRoutes:-1 for all).`)
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
      // Read the path stage 2 actually wrote to rather than recomputing it: if the two
      // ever disagreed, the grader would cat a missing file and silently downgrade to
      // "weak evidence" instead of failing.
      const tf = run.traceFile || traceFile(route, i)
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

  // ── Synthesis

  phase('Synthesis')

  const report = await agent(
    `You are assembling the final documentation-review report for ${repoRoot}. Be adversarial and honest; a clean verdict must be earned.\n\n` +
    `DETERMINISTIC MANIFEST SUMMARY:\n${JSON.stringify(manifest.summary, null, 2)}\n` +
    `Missing canonical docs: ${JSON.stringify(manifest.missing_canonical)}\n` +
    `Non-standard docs: ${JSON.stringify(manifest.files.filter(f => f.classification === 'non-standard').map(f => f.path))}\n` +
    `Orphans (unreachable from AGENTS.md): ${JSON.stringify(manifest.orphans)}\n` +
    `Location violations: ${JSON.stringify(manifest.location_violations)}\n` +
    // The summary carries these as bare counts. Without the detail and instruction 3 below,
    // a broken CLAUDE.md arrives as `claude_md_ok: false` inside a JSON blob with nothing
    // telling this stage to raise it — the manifest detects it and the report never says so.
    `Injected tool-blocks in steering docs: ${JSON.stringify(manifest.injected_blocks)}\n\n` +
    `READ-REVIEW FINDINGS (one agent per use case, plus the files that are not use cases):\n${JSON.stringify(readFindings, null, 2)}\n\n` +
    `HISTORY VERDICTS (behavioural: did past sessions in this repo actually open the doc their route points at?):\n${JSON.stringify(historyEntries, null, 2)}\n` +
    `History coverage: ${JSON.stringify((historySummary && historySummary.coverage) || {})}\n` +
    `Superseded-route evidence (sessions that ran under an EARLIER wording of a route — not evidence about today's text):\n${JSON.stringify((historySummary && historySummary.historical) || {}, null, 2)}\n\n` +
    `EXECUTION-TEST VERDICTS (synthetic: could a cold agent use the docs?):\n${JSON.stringify(execGraded, null, 2)}\n\n` +
    `Do all of the following:\n` +
    `1. Merge and DEDUPE findings (the same defect surfaced by two stages is ONE finding — cite the strongest evidence).\n` +
    `   When merging, PRESERVE what each recommended_action says it replaces, cuts, or supersedes — the lines it names are the fix, not decoration. A recommended_action that only adds text must say why nothing existing is superseded. Never compress a specific replacement into a general instruction to improve the section.\n` +
    `2. Cross-file reconciliation the per-file agents could not see: sibling contradictions on shared facts; and match any missing canonical doc to a non-standard doc whose content actually IS that topic (rename/link).\n` +
    `3. Raise the mechanical facts no read-review agent covered. CLAUDE.md is excluded from the read-review because the manifest checks it, so a false claude_md_ok is yours to report: CLAUDE.md must be exactly the one-line @AGENTS.md import, and the fix names a destination for each displaced piece — routing to AGENTS.md, topic procedures to docs/<TOPIC>.md, personal or transient notes to .claude.local.md. Every injected tool-block listed above is a finding against the doc holding it, under the same destination rule.\n` +
    `4. Fold the behavioural and synthetic evidence in. From execution: 'found-but-insufficient' or 'couldnt-route' is a real doc finding; discard 'inconclusive'. From history: only entries with attribution "doc" are doc findings — an "agent" attribution means the route was written correctly and skipped anyway, which belongs in execution_summary as an observation, never as a defect in the file. An "insufficient-evidence" attribution is not a finding of any kind.\n` +
    `5. State the evidence per use case in execution_summary: how many valid segments history had, which use cases had none, and which were probed by execution. A use case with no evidence is a gap in THIS AUDIT, never a defect in the doc — say so in those words rather than implying the doc is unused.\n` +
    `   Report the superseded-route evidence too, in its own short paragraph, and label it as being about wording that no longer exists. Quote the old route and give the ratio of segments that did the work to segments that opened the doc. Where a route has since been rewritten, say whether that evidence supports the rewrite. Never let it change a verdict or a finding about current text — but never drop it either: a route that was ignored under its old wording is the reason the new wording exists.\n` +
    `6. Assign an overall verdict: accurate / minor gaps / significant gaps / misleading. A clean 'accurate' requires no blocker/major AND positive coverage — not merely absence of findings.\n` +
    `7. Tag every finding \`settled\` or \`open\`, leaving none untagged. SETTLED is a doc contradicting the code or the repo's actual layout, a stale command, a dead link, a missing or misnamed route, CLAUDE.md carrying anything but the one-line import, an injected tool-block — one correct answer, nothing to weigh. OPEN moves content from one file to another (who owns a topic is a judgement), deletes a section someone may be relying on, rewords a route people's habits are built on, adopts a convention the repo has not committed to, or is large enough that "not now" is a real answer. When you can argue it either way it is settled: a doc that contradicts the code is a bug, and asking permission to fix it wastes the maintainer's attention. For every OPEN finding also fill \`question\` (what is being decided, in plain English a reader outside this audit understands, naming the file and what it currently says), \`options\` (the real alternatives, including "leave it as is" wherever that is one), and \`recommendation\` (which option you would pick and the tradeoff that decided it).\n\n` +
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
      level,
      read_findings: readFindings,
      use_cases_reviewed: useCases.map(u => u.useCase),
      history: historyEntries,
      history_coverage: (historySummary && historySummary.coverage) || null,
      execution: execGraded,
      routes_total: totalRoutes,
      routes_run: fileRoutes.length,
    },
  }
} else {
  // No `agent` hook: the Workflow runtime failed to inject it. Fail LOUD — returning
  // undefined here would be recorded by the harness as status:completed, i.e. a silent
  // no-op.
  throw new Error('project-review-docs: the Workflow runtime did not inject the `agent` hook')
}
