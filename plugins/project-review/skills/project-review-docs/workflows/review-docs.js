export const meta = {
  name: 'project-review-docs',
  description: 'Read-only documentation audit: manifest → batched read-review → history → synthesis',
  whenToUse: 'Launched by the /project-review-docs skill. Audits a project\'s docs for accuracy, boundary/belonging, form, and whether agents actually use them.',
  phases: [
    { title: 'Manifest', detail: 'deterministic facts: files, metrics, links, routes' },
    { title: 'Read-review', detail: 'docs packed into a few batches; each agent reads its batch once, then judges' },
    { title: 'History', detail: 'did past sessions open the doc their route points at?' },
    { title: 'Synthesis', detail: 'dedupe + cross-file reconciliation + report' },
  ],
}

// args: { repoRoot, scriptsDir, standardDir, level?, scratchDir? }

// ---------------------------------------------------------------------------
// Pure helpers — no runtime globals, so they are reachable without launching a
// multi-agent run. Unit-tested via tests/project-review/script-tests/test-review-docs.js.
// ---------------------------------------------------------------------------

// The depth vocabulary is shared with project-review-codebase and test-tests: one
// argument name, one token set, so a token learned at one skill means the same thing
// at the next.
const LEVELS = ['low', 'medium', 'high', 'ultra']

// Use case -> the doc AGENTS.md routes it to, and the work an agent arrives wanting to do.
// Mirrors USE_CASE_DOCS in scripts/history.py, which owns the classifier's label
// vocabulary. Workflow scripts cannot import shared code, so the two copies are pinned
// against drift by tests/project-review/script-tests/test-history.sh.
const USE_CASES = {
  'searching': { doc: 'docs/OVERVIEW.md', work: 'find your way around the repository — locate code, understand the layout' },
  'coding': { doc: 'docs/CODING.md', work: 'create or edit a file in the source tree' },
  'documenting': { doc: 'docs/DOCUMENTING.md', work: 'create or edit a Markdown file in this repository' },
  'testing': { doc: 'docs/TESTING.md', work: 'run or write tests, or judge whether a change is verified' },
  'running': { doc: 'docs/RUNNING.md', work: 'launch the product by hand to reproduce a bug or verify a change' },
  'change-workflow': { doc: 'docs/CHANGE-WORKFLOW.md', work: 'commit, branch, push, or open a PR' },
  'reviewing': { doc: 'docs/REVIEWING.md', work: 'review a PR or a diff' },
  'releasing': { doc: 'docs/RELEASING.md', work: 'cut a release' },
  'monitoring': { doc: 'docs/MONITORING.md', work: 'read logs, traces, or usage data' },
}

// What each level buys. Every agent turn re-sends the agent's whole context, so an agent
// that gathers evidence one tool call at a time pays for that context once per call. The
// per-file design this replaced gave each of 39 opus agents an open-ended "verify every
// claim against the repo" brief; they averaged 59 turns, and read-review alone cost about
// $100 on a 45-doc repo whose whole doc set is ~120k tokens. Here every agent reads a fixed
// file list in one parallel batch and then judges, so its turn count does not grow with the
// repo. A level therefore buys model, effort, and history sample size, never more turns.
const LEVEL_CONFIG = {
  low: { reviewModel: 'sonnet', reviewEffort: 'medium', sessionLimit: 15, perUseCase: 1, historyFindings: false },
  medium: { reviewModel: 'opus', reviewEffort: 'medium', sessionLimit: 40, perUseCase: 3, historyFindings: true },
  high: { reviewModel: 'opus', reviewEffort: 'high', sessionLimit: 100, perUseCase: 5, historyFindings: true },
  ultra: { reviewModel: 'opus', reviewEffort: 'xhigh', sessionLimit: 100, perUseCase: 5, historyFindings: true },
}

// Doc bytes per read-review agent. ~120KB is ~30k tokens: a 45-doc repo packs into four or
// five agents, each paying the fixed agent overhead once instead of once per file, while
// one agent can still give every file in its batch real attention.
const BATCH_BYTES = 120000

// A single miss is not a pattern. Below this many valid segments a use case reports
// coverage only — the floor that stops "no evidence" from being read as "bad doc".
const MIN_SEGMENTS_FOR_FINDING = 3

// Files a reader reaches first. Packed together, ahead of the use-case docs, so the router
// and the docs it routes to tend to share a batch and one agent sees both sides of a route.
const STEERING_FILES = ['AGENTS.md', 'README.md', 'CONTRIBUTING.md']

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

  const repoRoot = String(parsed.repoRoot || '').replace(/\/$/, '')
  const scriptsDir = String(parsed.scriptsDir || '')
  // The authoring standard lives in a different plugin, so its path cannot be derived
  // from scriptsDir — SKILL.md loads that skill and passes the base directory the
  // harness printed for it.
  const standardDir = String(parsed.standardDir || '').replace(/\/$/, '')
  const raw = String(parsed.level || '').toLowerCase()
  const level = LEVELS.includes(raw) ? raw : 'medium'

  // SKILL.md mints this per run with mktemp; the history stage writes its extracts and
  // labels there. Require absolute: a relative value — an unsubstituted "<SCRATCH>"
  // placeholder is truthy and would slip past a bare falsy check — would put those files
  // inside the tree being reviewed.
  const scratchDir = String(parsed.scratchDir || '/tmp/docreview-scratch')

  let error = null
  if (parsed.cost !== undefined) {
    // `cost` was renamed to `level`. Accepting it silently would hand a caller who asked
    // for an ultra audit a medium one and report raw.level as 'medium' with nothing in the
    // run output saying their requested depth was dropped.
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
    error = `scratchDir must be an absolute path (got ${JSON.stringify(scratchDir)}) — the history stage writes there, outside the repo`
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

// Split the manifest's reviewable files into use cases and the rest.
//
// A use case is reviewed only when its doc exists: the standard makes every topic doc
// optional and never reports one missing, so an absent doc is a choice rather than a gap.
// Everything else is still reviewed, just not as a use case — README and CONTRIBUTING
// serve humans rather than working agents, AGENTS.md is the router rather than any
// route's destination, and a non-standard doc is judged for placement.
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

// Every review target in batch order: the steering files, then the use-case docs, then the
// rest by path. Each target is { file, useCase } — useCase is null outside the use cases.
function orderTargets(manifestFiles) {
  const { useCases, residual } = splitReviewTargets(manifestFiles)
  const steering = STEERING_FILES.map(p => residual.find(f => f.path === p)).filter(Boolean)
  const rest = residual.filter(f => !STEERING_FILES.includes(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return [
    ...steering.map(file => ({ file, useCase: null })),
    ...useCases.map(uc => ({ file: uc.file, useCase: uc })),
    ...rest.map(file => ({ file, useCase: null })),
  ]
}

// Pack targets, in order, into batches of at most maxBytes of doc text. A file larger
// than the budget gets a batch of its own rather than being split or dropped.
function packBatches(targets, maxBytes) {
  const batches = []
  let current = []
  let size = 0
  for (const t of targets) {
    const bytes = (t.file.metrics && t.file.metrics.bytes) || 0
    if (current.length && size + bytes > maxBytes) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(t)
    size += bytes
  }
  if (current.length) batches.push(current)
  return batches
}

// The files a batch was handed that no returned result lists as reviewed — the whole batch
// when its agent died. Reported by name, so a partial review never reads as a full one.
function unreviewedFiles(batches, results) {
  const missing = []
  batches.forEach((batch, i) => {
    const done = new Set((results[i] && results[i].files_reviewed) || [])
    for (const t of batch) if (!done.has(t.file.path)) missing.push(t.file.path)
  })
  return missing
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
    files_reviewed: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          category: { type: 'string', enum: ['belonging', 'accuracy', 'form', 'hollow', 'placement', 'other'] },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          observation: { type: 'string' },
          evidence: { type: 'string' },
          recommended_action: { type: 'string' },
          routes_to: { type: 'string' },
        },
        required: ['file', 'category', 'severity', 'observation', 'evidence', 'recommended_action'],
      },
    },
  },
  required: ['files_reviewed', 'findings'],
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
    evidence_summary: { type: 'string' },
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

const HISTORY_ENTRY_SCHEMA = {
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

const HISTORY_SCHEMA = {
  type: 'object',
  properties: { entries: { type: 'array', items: HISTORY_ENTRY_SCHEMA } },
  required: ['entries'],
}

// Expose the pure helpers to any module loader (the Node unit tests in
// tests/project-review/script-tests use this). Assigned before the orchestration below so
// it is reached whichever path that takes.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeArgs, parseManifest, splitReviewTargets, orderTargets, packBatches,
    unreviewedFiles, historyFindingBar,
    LEVELS, LEVEL_CONFIG, USE_CASES, BATCH_BYTES, MIN_SEGMENTS_FOR_FINDING,
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

  const { repoRoot, scriptsDir, guidelinesFile, hygieneFile, setupFile, level, levelConfig, scratchDir } = cfg

  // ── Manifest (deterministic facts)

  phase('Manifest')
  // --brief: the agent's Bash tool returns only a preview of a large output, and the full
  // manifest of a 45-doc repo is 132KB. Relaying a preview is how two runs died here.
  const manifestText = await agent(
    `Run this exact command and return ONLY its raw stdout — no prose, no markdown fences:\n\n` +
    `python3 "${scriptsDir}/manifest.py" "${repoRoot}" --format=json --brief --setup-md="${setupFile}"\n\n` +
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

  // The route's own wording, keyed by destination — the use-case section and the history
  // judge both ask whether that route delivers an agent to its doc.
  const routeText = {}
  for (const r of (manifest.agents_routes || [])) {
    if (r && r.target && !routeText[r.target]) routeText[r.target] = r.text || ''
  }
  const quotedRoute = (doc) => routeText[doc] ? JSON.stringify(routeText[doc]) : '(no route to this doc found in AGENTS.md)'

  // The project's own doc conventions, and the decisions it has already taken about what
  // it documents and what it leaves out. Most repos have no such file, and then no agent
  // is told anything about decisions.
  const hasDocumenting = (manifest.files || []).some(f => f && f.path === 'docs/DOCUMENTING.md')
  const documentingFile = repoRoot + '/docs/DOCUMENTING.md'

  // ── Read-review: a few batch agents, each reading its fixed file list once

  phase('Read-review')

  const batches = packBatches(orderTargets(manifest.files), BATCH_BYTES)

  const contractLines = (f) => {
    const c = f.contract || {}
    return `  Ownership contract (the bar for "belongs here"):\n` +
      `    Audience: ${c.audience || '(unspecified)'}\n` +
      `    Inside:   ${c.inside || '(unspecified)'}\n` +
      `    Not inside: ${c.not_inside || '(unspecified)'}\n`
  }

  // What is specific to one file: its facts, and the seat it is judged from. Everything
  // shared by every file is stated once in batchPrompt.
  const fileSection = (t, n) => {
    const f = t.file
    const m = f.metrics || {}
    const dead = (f.unresolved_links || []).map(l => `L${l.line} ${l.ref} (${l.reason})`).join('; ') || 'none'
    const head = `\n── FILE ${n}: ${f.path} — ${m.lines} lines, ${m.words} words. Unresolved links (from the manifest): ${dead}.\n`
    if (t.useCase) {
      // It arrives wanting to do the work, not to audit a file: the doc has to carry it
      // through the task, and a doc that reads well but leaves the work undoable is the
      // defect this framing catches and a file audit does not.
      return head +
        `  Use case "${t.useCase.useCase}": judge this file as an agent that arrives wanting to ${t.useCase.work}, sent here by AGENTS.md. AGENTS.md is always in that agent's context, so treat its route as already read. The route's wording: ${quotedRoute(t.useCase.doc)}\n` +
        `  A. COULD YOU DO THE WORK? Walk the task through the doc. Name every point where you would have to guess, leave the doc, or already know something it never states. A gap that stops the work is a blocker; one that slows it is major.\n` +
        `  B. Does the route deliver you here at the right moment? A route that names a topic rather than a triggering action, or reads as optional, is an Obligation finding against AGENTS.md — report it on this file with routes_to "AGENTS.md".\n` +
        contractLines(f)
    }
    if (f.path === 'AGENTS.md') {
      // Naming an action is necessary but not sufficient. A route can satisfy every written
      // rule and still be unfollowable because the action it names has no first instant.
      // Reading the route is the only way to catch this — the history stage can confirm it,
      // but only where transcripts exist.
      return head +
        `  The routing layer. Judge it as a router: every route an obligation naming the triggering action (the Obligation rule), no procedure that belongs in a destination, and short enough to scan in the first seconds of a task.\n` +
        `  TRIGGER EDGE — apply this to EVERY route, separately from whether the route says MUST. Ask: is there a single, recognizable instant at which an agent knows it is about to do this?\n` +
        `  - Has an edge: "before creating or editing ANY file under \`src/\`" (the first Edit on that path), "before ANY git operation" (the first git command), "before cutting a release".\n` +
        `  - Has NO edge: "before searching this repository" — searching has no beginning; an agent greps within seconds of starting and never has a moment where "I am now beginning to search" occurs. Likewise "before judging whether a change is verified", or any trigger phrased as a symptom the agent must first diagnose ("when X will not connect"), which fires only after the work is underway.\n` +
        `  An edgeless trigger is an Obligation finding even when the route is a correctly worded MUST: a diligent agent cannot obey it. Severity major. The fix names an action with a detectable first instant — e.g. replace "before searching this repository" with "before your first grep, rg, or Glob in this repo" — and replaces the existing trigger rather than being added beside it.\n` +
        contractLines(f)
    }
    if (f.contract) return head + contractLines(f)
    return head +
      `  NON-STANDARD doc — not one of the canonical files, so it has no ownership contract. FILED CORRECTLY? If its content belongs to a canonical topic (OVERVIEW / CODING / DOCUMENTING / TESTING / RELEASING / MONITORING / CHANGE-WORKFLOW / RUNNING / REVIEWING / README / CONTRIBUTING), that is a placement finding: recommend RENAME to docs/<TOPIC>.md when that canonical slot is empty (missing canonical: ${JSON.stringify(manifest.missing_canonical)}), or LINK it from the canonical doc when the slot is filled. Content of no canonical topic is legitimately project-specific. Also flag it if it is hollow (a stub) or duplicates AGENTS.md routing. Specs and design docs are read as authoritative, so one that contradicts a canonical doc you read is a blocker.\n`
  }

  const batchPrompt = (batch) => {
    const readList = [
      guidelinesFile,
      hygieneFile,
      ...(hasDocumenting ? [documentingFile] : []),
      ...batch.map(t => `${repoRoot}/${t.file.path}`),
    ]
    return `Repo root: ${repoRoot}\n` +
      `You audit ${batch.length} documentation file(s) of this repository against an authoring standard.\n\n` +
      `READ ONCE — your first action is ONE parallel batch of Read calls, one per file in this list. They are the only tool calls you make before you return: no Bash, no Grep, no Glob, no other Read. The audit is judged on these files alone, and what they do not show is outside it. If a Read is refused for size, read that file in parts with offset and limit.\n` +
      readList.map(p => `  ${p}`).join('\n') + '\n\n' +
      `THE STANDARD — the first file holds the doc-set rules: the six named rules (Ownership, Local delta, Anchors, Command register, Economy, Obligation), the failure modes, and the closing bar every fix you recommend must itself clear. The second binds any document an agent reads: single source of truth, cache, relevance, sediment, no-ops and negation. A finding under either is a finding.\n` +
      (hasDocumenting
        ? `\nRECORDED DOC DECISIONS — the third file, docs/DOCUMENTING.md, carries this project's own doc conventions and the decisions it has taken about what it documents and what it leaves out on purpose. Treat a gap those decisions settle as answered and leave it out of your findings. They bind GAP findings only: a false or contradictory claim, a dead link, or content outside a file's Inside boundary stays a finding at full severity however the decisions read. A decision that contradicts what the other files show is itself a finding, against docs/DOCUMENTING.md.\n`
        : '') +
      // Severity is a required enum on every finding, so leaving the bar unstated does not
      // produce fewer severities — it produces severities assigned from the model's priors,
      // which vary run to run. This is the whole rubric; it has no other home the agent reads.
      `\nSEVERITY — assign every finding against this bar, not by feel:\n` +
      `  blocker: a documented fact or procedure that is wrong, or a doc largely in the wrong genre for its owner — it misleads confidently.\n` +
      `  major:   a real scope, actionability, or belonging gap (a localized out-of-boundary spill, a stale command, a routing gap), or bloat heavy enough to obscure the procedure the file exists to document.\n` +
      `  minor:   clarity, scanability, and economy defects a reader absorbs without being misled.\n` +
      `Raise one level when the defect directly breaks a real workflow — a stale command in RELEASING.md is a blocker, not a minor. Judge Economy by what the bloat costs a reader rather than by line count, and treat minor as its floor, not its ceiling.\n\n` +
      // The read-only contract below is what bounds the cost: an agent allowed to check
      // claims against the code spends one turn per claim, and each turn re-sends all it
      // has read so far.
      `ACCURACY FROM THE TEXT — you do not open the code, so you cannot confirm that a command, path, or flag still exists, and you do not raise a finding that only says a claim is unverified. Raise an accuracy finding on what the files show: two docs that contradict each other, a doc that contradicts itself, a procedure whose steps cannot all be true, an unresolved link listed below.\n\n` +
      `FOR EVERY FILE — for each unit of content (claim, command, path, table, section) ask whether it BELONGS HERE. Content that matches the file's Not-inside boundary is a belonging finding even when accurate (the Ownership rule); its fix routes the content to the owning file, never "keep it as a subsection here". Then judge the file as a whole against the Economy rule, from the rules file rather than memory, and raise what fails it as a form finding naming the spans you would cut.\n` +
      batch.map((t, i) => fileSection(t, i + 1)).join('') +
      `\nReturn files_reviewed listing the repo-relative path of every file above that you read and judged, and findings, each naming its file. Quote the offending lines as evidence. A clean file gets no findings — do not invent problems.`
  }

  const reviewResults = await parallel(batches.map((batch, i) => () =>
    agent(batchPrompt(batch), {
      label: `review-${i + 1}/${batches.length}`,
      phase: 'Read-review',
      model: levelConfig.reviewModel,
      effort: levelConfig.reviewEffort,
      schema: FINDINGS_SCHEMA,
    })
  ))
  const readFindings = reviewResults.filter(Boolean).flatMap(r => r.findings || [])
  const notReviewed = unreviewedFiles(batches, reviewResults)
  const targetCount = batches.reduce((n, b) => n + b.length, 0)
  log(`Read-review: ${targetCount} file(s) in ${batches.length} batch(es), ${readFindings.length} raw findings (${levelConfig.reviewModel}, effort ${levelConfig.reviewEffort})` +
      (notReviewed.length ? `; NOT reviewed: ${notReviewed.join(', ')}` : ''))

  // ── History: did past sessions in this repo actually open the doc they were routed to?
  //
  // Real evidence, at the cost of being a lagging indicator, which is why every segment is
  // filtered against how much its route has changed since.

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
  const sessionBatches = (promptIndex && promptIndex.batches) || []

  if (!promptIndex) {
    // already logged
  } else if (!sessionBatches.length) {
    log(`History: no session transcripts for this repository (${promptIndex.projects_dir}) — stage skipped.`)
  } else {
    // Classify: one agent per batch, labelling user messages only. Intent is judgment,
    // so no script decides it; the agent writes labels back for history.py to read.
    const labelWrites = await parallel(sessionBatches.map((b, i) => () =>
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
    log(`History: ${labelled.length}/${sessionBatches.length} batch(es) classified, ` +
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
      const evidenceFiles = historySummary.evidence_files || {}
      // Guard on USE_CASES: the judge prompt dereferences USE_CASES[u].doc, so a key the
      // script emitted but this table does not know would throw mid-stage.
      const judgeable = Object.keys(coverage).filter(u => USE_CASES[u] && evidenceFiles[u] && (coverage[u].valid || 0) > 0)
      log(`History: ${judgeable.length}/${Object.keys(coverage).length} use case(s) have valid evidence` +
          ` (floor for a finding is ${MIN_SEGMENTS_FOR_FINDING} segments)`)

      if (judgeable.length) {
        // One judge for every use case: the rules below are the same for all of them, and
        // each evidence file is small enough to read in a single call.
        const perUseCase = judgeable.map(u => {
          const doc = USE_CASES[u].doc
          const bar = historyFindingBar({ coverage: coverage[u] }, levelConfig)
          return `- use_case "${u}", doc ${doc}, evidence ${evidenceFiles[u]}\n` +
            `  Route wording in AGENTS.md: ${quotedRoute(doc)}\n` +
            `  EVIDENCE BAR: ${bar.canFind ? `${bar.reason} — a finding is allowed.` : `${bar.reason} — report the counts and set severity "none" and attribution "insufficient-evidence". Do not raise a finding from this sample.`}`
        }).join('\n')

        const judged = await agent(
          `You judge whether past Claude Code sessions in this repository opened the doc their AGENTS.md route points at before doing the work. Your first action is ONE parallel batch of Read calls, one per evidence file listed under USE CASES. They are the only tool calls you make.\n\n` +
          `Each evidence file holds one use case. Each segment in it is one stretch of a past session doing that kind of work, and carries:\n` +
          `  first_doc_read_turn — when the doc was opened, or null if it never was\n` +
          `  first_work_turn — the first write or command in that segment\n` +
          `  writes / commands / other_reads — what the agent actually did\n\n` +
          `Classify every segment: routed (doc opened before first_work_turn), late (opened after it — the standard says loading afterwards does not count as routing), missed (never opened though real work happened), not-applicable (no real work of this kind actually took place; the label was wrong).\n\n` +
          `AGENTS.md is always in an agent's context and is never Read, so its absence from the reads means nothing. The destination doc is the whole signal.\n\n` +
          `Classify each route's wording as: obligation (a MUST naming the action that triggers it), advisory ("see X", "load X to understand Y", or anything an agent reads as skippable), or absent.\n\n` +
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
          `SUPERSEDED ROUTES — each file's "historical" array holds segments that ran under an EARLIER wording of the route, summarised as: the old route text, how many segments did real work, and how many opened the doc. These are excluded from every count above because they are not evidence about today's route.\n` +
          `Report them in historical_note anyway, in one or two sentences: quote the old wording and give the ratio, e.g. 'under the previous advisory wording "Load X for guidance", 25 of 25 segments did the work and 4 opened the doc'. This is what shows whether a rewrite was warranted, so state it plainly. If coverage carries historical_truncated, say how many were not examined.\n` +
          `It is NEVER a finding about the current text and must not move severity or attribution. Leave historical_note empty when the array is empty.\n\n` +
          `Never treat "no sessions" or "few sessions" as a defect in the doc.\n\n` +
          `USE CASES:\n${perUseCase}\n\n` +
          `Return one entry per use case above, with its counts, the route classification, and the finding if one is warranted.`,
          { label: 'history:judge', phase: 'History', model: 'sonnet', effort: 'medium', schema: HISTORY_SCHEMA }
        )
        historyEntries = ((judged && judged.entries) || []).filter(h => h && judgeable.includes(h.use_case))
      }

      const real = historyEntries.filter(h => h.attribution === 'doc' && h.severity !== 'none')
      const superseded = Object.keys((historySummary && historySummary.historical) || {})
      log(`History: ${historyEntries.length} use case(s) judged, ${real.length} doc finding(s)` +
          (superseded.length ? `; superseded-route evidence for ${superseded.length} use case(s) (reported, never a finding)` : ''))
    }
  }

  // ── Synthesis

  phase('Synthesis')

  const report = await agent(
    `You are assembling the final documentation-review report for ${repoRoot}. Be adversarial and honest; a clean verdict must be earned.\n\n` +
    `DETERMINISTIC MANIFEST SUMMARY:\n${JSON.stringify(manifest.summary)}\n` +
    `Missing canonical docs: ${JSON.stringify(manifest.missing_canonical)}\n` +
    `Non-standard docs: ${JSON.stringify(manifest.files.filter(f => f.classification === 'non-standard').map(f => f.path))}\n` +
    `Orphans (unreachable from AGENTS.md): ${JSON.stringify(manifest.orphans)}\n` +
    `Location violations: ${JSON.stringify(manifest.location_violations)}\n` +
    // The summary carries these as bare counts. Without the detail and instruction 3 below,
    // a broken CLAUDE.md arrives as `claude_md_ok: false` inside a JSON blob with nothing
    // telling this stage to raise it — the manifest detects it and the report never says so.
    `Injected tool-blocks in steering docs: ${JSON.stringify(manifest.injected_blocks)}\n\n` +
    `READ-REVIEW FINDINGS (batch agents that read each doc and the standard, and did NOT check claims against the code):\n${JSON.stringify(readFindings)}\n` +
    `Files the read-review did not cover: ${JSON.stringify(notReviewed)}\n\n` +
    `HISTORY VERDICTS (behavioural: did past sessions in this repo actually open the doc their route points at?):\n${JSON.stringify(historyEntries)}\n` +
    `History coverage: ${JSON.stringify((historySummary && historySummary.coverage) || {})}\n` +
    `Superseded-route evidence (sessions that ran under an EARLIER wording of a route — not evidence about today's text):\n${JSON.stringify((historySummary && historySummary.historical) || {})}\n\n` +
    `Do all of the following:\n` +
    `1. Merge and DEDUPE findings (the same defect surfaced twice is ONE finding — cite the strongest evidence).\n` +
    `   When merging, PRESERVE what each recommended_action says it replaces, cuts, or supersedes — the lines it names are the fix, not decoration. A recommended_action that only adds text must say why nothing existing is superseded. Never compress a specific replacement into a general instruction to improve the section.\n` +
    `2. Cross-file reconciliation the batch agents could not see, since each saw only its own batch: sibling contradictions on shared facts; and match any missing canonical doc to a non-standard doc whose content actually IS that topic (rename/link).\n` +
    `3. Raise the mechanical facts no read-review agent covered. CLAUDE.md is excluded from the read-review because the manifest checks it, so a false claude_md_ok is yours to report: CLAUDE.md must be exactly the one-line @AGENTS.md import, and the fix names a destination for each displaced piece — routing to AGENTS.md, topic procedures to docs/<TOPIC>.md, personal or transient notes to .claude.local.md. Every injected tool-block listed above is a finding against the doc holding it, under the same destination rule.\n` +
    `4. Fold the behavioural evidence in. From history: only entries with attribution "doc" are doc findings — an "agent" attribution means the route was written correctly and skipped anyway, which belongs in evidence_summary as an observation, never as a defect in the file. An "insufficient-evidence" attribution is not a finding of any kind.\n` +
    `5. Write evidence_summary. State that the read-review judged the docs from their text and did not check documented commands, paths, or flags against the code, so a doc that has drifted from the code without contradicting another doc is not caught by this audit. Name any file the read-review did not cover. Then state the evidence per use case: how many valid segments history had and which use cases had none. A use case with no evidence is a gap in THIS AUDIT, never a defect in the doc — say so in those words rather than implying the doc is unused.\n` +
    `   Report the superseded-route evidence too, in its own short paragraph, and label it as being about wording that no longer exists. Quote the old route and give the ratio of segments that did the work to segments that opened the doc. Where a route has since been rewritten, say whether that evidence supports the rewrite. Never let it change a verdict or a finding about current text — but never drop it either: a route that was ignored under its old wording is the reason the new wording exists.\n` +
    `6. Assign an overall verdict: accurate / minor gaps / significant gaps / misleading. A clean 'accurate' requires no blocker/major AND positive coverage — not merely absence of findings.\n` +
    `7. Tag every finding \`settled\` or \`open\`, leaving none untagged. SETTLED is a doc contradicting another doc or itself, a stale command, a dead link, a missing or misnamed route, CLAUDE.md carrying anything but the one-line import, an injected tool-block — one correct answer, nothing to weigh. OPEN moves content from one file to another (who owns a topic is a judgement), deletes a section someone may be relying on, rewords a route people's habits are built on, adopts a convention the repo has not committed to, or is large enough that "not now" is a real answer. When you can argue it either way it is settled: a doc that contradicts the repo is a bug, and asking permission to fix it wastes the maintainer's attention. For every OPEN finding also fill \`question\` (what is being decided, in ASD-STE100 Simplified Technical English — one idea per sentence, every identifier and abbreviation expanded — naming the file and what it currently says, so a reader outside this audit understands it), \`options\` (the real alternatives, including "leave it as is" wherever that is one), and \`recommendation\` (which option you would pick and the tradeoff that decided it).\n\n` +
    (hasDocumenting
      ? `RECORDED DOC DECISIONS — read ${documentingFile} in full before you settle the findings list; it is the only file you read. It carries this project's doc conventions and what it has decided to leave undocumented. Drop any finding those decisions already settle, including one a read-review agent raised, and say in cross_file_notes which findings you dropped and which decision covered each. A decision binds GAP findings only: a false claim, a stale command, a dead link, or a broken CLAUDE.md stays a finding at full severity. A decision that contradicts the repo is a finding against docs/DOCUMENTING.md.\n\n`
      : `Everything you need is above; make no tool calls.\n\n`) +
    `Return the structured object with fields verdict, headline, findings[], cross_file_notes, evidence_summary. ` +
    `Each finding's why_it_matters states the concrete cost, risk, or trap the defect creates for someone relying on the doc — not a restatement of the observation. ` +
    `cross_file_notes and evidence_summary are separate PLAIN-TEXT prose fields — never write XML/HTML tags, angle-bracket markers, or field names inside their values. ` +
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
      review_batches: batches.map(b => b.map(t => t.file.path)),
      not_reviewed: notReviewed,
      history: historyEntries,
      history_coverage: (historySummary && historySummary.coverage) || null,
    },
  }
} else {
  // No `agent` hook: the Workflow runtime failed to inject it. Fail LOUD — returning
  // undefined here would be recorded by the harness as status:completed, i.e. a silent
  // no-op.
  throw new Error('project-review-docs: the Workflow runtime did not inject the `agent` hook')
}
