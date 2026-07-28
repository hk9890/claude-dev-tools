export const meta = {
  name: 'test-app',
  description: 'Exploratory application testing: recon → planned drive/analyse loop → repro-confirm (ultra) → report',
  whenToUse: 'Launched by the /project-auto-work:test-app skill. Actually runs the application and uses it, then judges what happened against the project\'s own user-facing docs and monitoring data. Reports findings, questions and proposals; writes no code and fixes nothing.',
  phases: [
    { title: 'Recon', detail: 'user-facing docs → launch contract, monitoring contract, flow inventory' },
    { title: 'Loop', detail: 'per iteration: driver runs the app, analyst reads the evidence and judges' },
    { title: 'Confirm', detail: 're-run each finding\'s repro alone (level=ultra only)' },
    { title: 'Synthesis', detail: 'verdict, findings, questions, coverage, report' },
  ],
}

// args: { repoRoot, referencesDir, focus?, level?, scratchDir? }

// ---------------------------------------------------------------------------
// Pure helpers — no runtime globals, so the abort gates, dials, batch planner and
// evidence cap are reachable without launching a run. A run of this workflow
// executes the user's application for real against whatever environment it is
// configured for, so a unit test is the only cheap way to exercise these.
// Unit-tested via tests/project-auto-work/script-tests/test-test-app.js.
// ---------------------------------------------------------------------------

// The depth vocabulary is shared with test-tests, project-review-codebase and
// project-review-docs: one argument name, one token set, so a token learned at one
// skill means the same thing at the next.
const LEVELS = ['low', 'medium', 'high', 'ultra']

// Dials per level. Unlike the sibling audits, `ultra` is a real rung here rather than an
// alias for `high`: the expensive, environment-mutating act is re-driving the application,
// so the repro-confirm pass — the only stage that runs the app a second time to check a
// finding — is what ultra buys. Aggression is the one dial that changes what is done TO
// the environment, not just how much of it is visited.
const DIALS = {
  low:    { ceiling: 2, flows: 2, aggression: 'happy-path',    confirm: false },
  medium: { ceiling: 4, flows: 3, aggression: 'break-it',      confirm: false },
  high:   { ceiling: 8, flows: 4, aggression: 'break-it-hard', confirm: false },
  ultra:  { ceiling: 8, flows: 4, aggression: 'break-it-hard', confirm: true },
}

// Consecutive iterations that must produce nothing new before the loop exits early.
// The ceiling is the hard bound; this only avoids burning launches on an app that has
// gone quiet.
const DRY_LIMIT = 2

// How the aggression dial reads to the driver agent. Kept beside DIALS so a new rung
// cannot be added without deciding what it does to the user's environment.
const AGGRESSION_BRIEF = {
  'happy-path':
    'Exercise ONLY the documented happy path of each assigned flow, with realistic, well-formed input. ' +
    'Do not probe edge cases, do not send malformed input, do not attempt volume or interruption. ' +
    'This is the rung a user picks when unsure what the environment can absorb — stay inside it.',
  'break-it':
    'Exercise each assigned flow\'s happy path first, then apply the instincts in break-it.md to that same flow: ' +
    'extreme input, out-of-order steps, empty state, the unhappy path. Follow the instincts as prompts, not as a checklist.',
  'break-it-hard':
    'Exercise each assigned flow hard. Happy path first, then push it with break-it.md across every dimension that applies — ' +
    'extreme input, volume, interruption and cancellation, malformed input, missing permissions, empty state. ' +
    'This rung is expected to create, delete and send real data.',
}

function dialFor(level) {
  return DIALS[level] || DIALS.medium
}

// Normalize the incoming `args` value into the run's configuration, and reject an unusable
// one before anything launches the application.
// Defensive: the runtime may hand `args` over as a JSON *string* rather than a parsed
// object (observed in practice with the sibling workflows). A string has no `.repoRoot`, so
// reading it directly would leave every field undefined.
function normalizeArgs(rawArgs) {
  let parsed = rawArgs
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = {} }
  }
  parsed = parsed || {}

  const repoRoot = String(parsed.repoRoot || '')
  const referencesDir = String(parsed.referencesDir || '')
  const raw = String(parsed.level || '').toLowerCase()
  const level = LEVELS.includes(raw) ? raw : 'medium'
  // Empty focus is legitimate and means "launch it and play around" — it is not an error.
  const focus = String(parsed.focus || '').trim()

  // SKILL.md mints this per run with mktemp; the per-iteration paths below are indexed,
  // not unique, so the bare default is safe for one run at a time only. Require absolute:
  // agents `mkdir -p` it and write captured monitoring evidence there, and a relative
  // value (an unsubstituted "<SCRATCH>" placeholder is truthy and slips past a falsy
  // check) would drop all of that inside the project being tested.
  const scratchDir = String(parsed.scratchDir || '/tmp/test-app-scratch')

  let error = null
  if (!repoRoot || !referencesDir) {
    error = 'missing required args: repoRoot and referencesDir must both be set'
  } else if (!repoRoot.startsWith('/')) {
    error = `repoRoot must be an absolute path (got ${JSON.stringify(repoRoot)}) — agents cd into it and launch the application from it`
  } else if (!referencesDir.startsWith('/')) {
    error = `referencesDir must be an absolute path (got ${JSON.stringify(referencesDir)}) — break-it.md is read from it`
  } else if (!scratchDir.startsWith('/')) {
    error = `scratchDir must be an absolute path (got ${JSON.stringify(scratchDir)}) — captured evidence is written there, outside the project`
  }

  return {
    repoRoot,
    referencesDir,
    focus,
    level,
    dial: dialFor(level),
    scratchDir,
    breakItFile: `${referencesDir.replace(/\/$/, '')}/break-it.md`,
    // Echoed on a bail-out: the error names the expected keys, so without the keys that
    // actually arrived a caller who sent `repo_root` cannot tell which one is wrong.
    receivedKeys: Object.keys(parsed),
    error,
  }
}

// Which abort gate recon trips, or null to proceed. ORDER MATTERS: an app that cannot be
// launched cannot be tested under any focus, so the launch gate is evaluated first —
// reporting an unmatched focus for an unlaunchable app would send the user to fix the
// wrong thing.
function reconAbort(recon, focus) {
  const lc = (recon && recon.launch_contract) || {}
  if (!lc.complete || !lc.start_cmd) {
    return {
      reason: 'the project does not document how to run this application',
      evidence:
        `Docs consulted: ${(recon && recon.docs_read) || '(none reported)'}\n` +
        `Start command found: ${lc.start_cmd || 'NONE'}\n` +
        `Readiness check found: ${lc.ready_check || 'NONE'}\n` +
        `Teardown found: ${lc.teardown_cmd || 'NONE'}\n` +
        `What is missing: ${lc.missing || '(agent gave no detail)'}`,
      remediation:
        'This skill never guesses how to start an application and carries no technology-specific launch patterns — ' +
        'the project must state it. Document, where this project documents how to run things (a RUNNING/README section): ' +
        'the exact command that starts the application, how to tell when it is ready, and how to stop it. Then re-run.',
    }
  }
  const fm = (recon && recon.focus_map) || {}
  if (focus && (!fm.in_scope_ids || fm.in_scope_ids.length === 0)) {
    const inventory = (recon && recon.flow_inventory) || []
    return {
      reason: 'the requested focus does not match anything in this application',
      evidence:
        `Focus given: ${focus}\n` +
        `Why it did not match: ${fm.unmatched_reason || '(agent gave no detail)'}\n` +
        `Areas that WERE identified from the project's user-facing docs:\n` +
        (inventory.length
          ? inventory.map(f => `  - ${f.area}: ${f.exercise}`).join('\n')
          : '  (none — recon found no exercisable flow at all)'),
      remediation:
        'Re-run with a focus naming one of the areas listed above, or with no focus at all to exercise the application broadly. ' +
        'Testing an area the application does not have would have run real, possibly mutating operations against the wrong part of your environment.',
    }
  }
  return null
}

// The next iteration's batch, composed by the script rather than by an agent so the loop
// stays deterministic — the reason for using a workflow at all. Leads come first: they are
// the things an analyst just found reason to suspect, and a lead left to the end of the
// inventory would routinely never be reached before the ceiling.
function composeBatch(inventory, exercisedIds, size) {
  const done = new Set(exercisedIds)
  const open = inventory.filter(f => f && f.id && !done.has(f.id))
  const leads = open.filter(f => f.origin === 'lead')
  const planned = open.filter(f => f.origin !== 'lead')
  return leads.concat(planned).slice(0, Math.max(0, size))
}

// Mint a stable id for a lead the analyst raised. Deterministic — Math.random() and
// Date.now() are unavailable in workflow scripts (they would break resume).
function leadId(iteration, index) {
  return `lead-${iteration}-${index + 1}`
}

// An iteration is dry when it moved nothing forward: no finding, no question, no lead.
// Coverage alone does not count — an iteration that exercised its flows and found nothing
// is exactly the signal the dry-streak exists to detect.
function isDry(analysis) {
  if (!analysis) return false // a failed analyst is not evidence of quiet; do not count it
  return (analysis.findings || []).length === 0 &&
         (analysis.questions || []).length === 0 &&
         (analysis.leads || []).length === 0
}

// Whether the run could see inside the application or only its surface. Drives the verdict
// cap: with no monitoring contract, "nothing broke" means "nothing visibly broke".
function evidenceBasis(monitoring) {
  return monitoring && monitoring.available && (monitoring.sources || []).length > 0
    ? 'monitoring-backed'
    : 'surface-only'
}

// Enforce the surface-only caveat in the headline. The synthesis agent is instructed to
// state it, but the whole value of the caveat is that it cannot be quietly dropped — so
// the guarantee is made in code, not in a prompt.
function stampBasis(report, basis) {
  if (!report || basis !== 'surface-only') return report
  const headline = String(report.headline || '')
  if (/surface-only/i.test(headline)) return report
  return { ...report, headline: `${headline} (surface-only: internal behaviour unverified)`.trim() }
}

// Every iteration launches the application itself (each driver owns its own launch), so
// nothing structurally binds them to the same build. When they disagree, findings from
// different iterations describe different software and must not be read as one picture.
function buildDrift(builds) {
  const seen = builds.filter(b => b && b.build_identity)
  const distinct = [...new Set(seen.map(b => b.build_identity.trim()))]
  if (distinct.length < 2) return null
  return `iterations did not all exercise the same build: ` +
    seen.map(b => `iteration ${b.iteration} ran "${b.build_identity.trim()}"`).join('; ') +
    ` — findings from different iterations are not directly comparable`
}

// Whether the document agent actually wrote the report or punted. Observed in practice: an
// agent that has just emitted a large structured report answers the markdown field with a
// placeholder ("« see below »"), and the saved file — the whole deliverable — is 13 bytes.
// The floor scales with the finding count, since a report with more findings cannot be
// shorter, and is capped so a genuinely small clean report still passes.
function isUsableMarkdown(md, report) {
  if (typeof md !== 'string') return false
  const findings = ((report && report.findings) || []).length
  const floor = Math.min(300 + 80 * findings, 3000)
  return md.trim().length >= floor
}

// A deterministic document assembled from the structured report. The fallback when the
// document agent fails or punts: less readable than agent-authored prose, but it always
// contains the findings, which a placeholder does not.
function renderFallbackMarkdown(report, meta) {
  const r = report || {}
  const m = meta || {}
  const sec = (title, lines) => (lines.length ? [`## ${title}`, '', ...lines, ''] : [])
  const findings = (r.findings || []).map((f, i) => [
    `### ${i + 1}. ${f.title} — ${f.severity}`,
    '',
    `- **What was done:** ${f.what_was_done}`,
    `- **Expected:** ${f.expected} _(source: ${f.expected_source})_`,
    `- **Actual:** ${f.actual}`,
    `- **Repro:** ${f.repro}`,
    ...(f.evidence ? [`- **Evidence:** ${f.evidence}`] : []),
    `- **Reproduced in isolation:** ${f.repro_confirmed}`,
    '',
  ].join('\n'))
  return [
    `# Exploratory application test — ${m.repoRoot || 'application'}`,
    '',
    `**Verdict:** ${r.verdict} (${r.evidence_basis})`,
    '',
    r.headline || '',
    '',
    `Level ${m.level}${m.focus ? `, focus "${m.focus}"` : ', no focus (broad exploration)'}. Stopped: ${r.stop_reason}.`,
    '',
    `> This document was assembled mechanically from the structured report because the ` +
    `document agent did not return a usable one. The findings below are complete; the prose is not.`,
    '',
    ...sec('Findings', findings),
    ...sec('Open questions', (r.questions || []).map(q => `- **${q.title}** — ${q.context} _(unclear: ${q.why_unclear})_`)),
    ...sec('Proposals', (r.proposals || []).map(p => `- ${p.action} — ${p.rationale}`)),
    ...sec('What was checked', (r.checked || []).map(c => `- ${c}`)),
    ...sec('What was NOT checked', (r.not_checked || []).map(c => `- ${c}`)),
  ].join('\n')
}

// Everything the run did NOT cover, so a short findings list cannot read as a clean bill of
// health. Assembled in code so it survives an agent that would rather not mention it.
function notCheckedList({ level, dial, focus, monitoring, inventory, exercisedIds, stopReason, failedIterations }) {
  const done = new Set(exercisedIds)
  const unreached = inventory.filter(f => f && f.id && !done.has(f.id))
  return [
    ...unreached.map(f => `flow "${f.area}: ${f.exercise}" — never reached (${stopReason === 'dry' ? 'loop exited early on a dry streak' : `iteration ceiling ${dial.ceiling} reached at level=${level}`})`),
    ...(evidenceBasis(monitoring) === 'surface-only'
      ? [`internal behaviour — the project documents no monitoring contract${monitoring && monitoring.why_absent ? ` (${monitoring.why_absent})` : ''}, so a failure swallowed into a log or a metric would not have been seen`]
      : []),
    ...(dial.confirm ? [] : ['repro-confirmation — findings were observed once and not re-run in isolation; that pass runs at level=ultra only']),
    ...(dial.aggression === 'happy-path' ? ['edge cases, malformed input, volume and interruption — level=low exercises documented happy paths only'] : []),
    ...(focus ? [`everything outside the requested focus (${focus})`] : []),
    ...failedIterations.map(n => `iteration ${n} — the agent did not complete, so its assigned flows produced no evidence`),
  ]
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RECON_SCHEMA = {
  type: 'object',
  properties: {
    app_summary: { type: 'string' },
    docs_read: { type: 'string' },
    launch_contract: {
      type: 'object',
      properties: {
        build_cmd: { type: 'string' },
        start_cmd: { type: 'string' },
        version_check: { type: 'string' },
        isolation: { type: 'string' },
        ready_check: { type: 'string' },
        teardown_cmd: { type: 'string' },
        source: { type: 'string' },
        startup_s: { type: 'number' },
        complete: { type: 'boolean' },
        missing: { type: 'string' },
      },
      required: ['complete'],
    },
    monitoring_contract: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
        source_doc: { type: 'string' },
        why_absent: { type: 'string' },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              how_to_read: { type: 'string' },
              live_only: { type: 'boolean' },
            },
            required: ['name', 'how_to_read', 'live_only'],
          },
        },
      },
      required: ['available'],
    },
    flow_inventory: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          exercise: { type: 'string' },
          expectation: { type: 'string' },
          doc_source: { type: 'string' },
        },
        required: ['area', 'exercise', 'expectation'],
      },
    },
    focus_map: {
      type: 'object',
      properties: {
        focus_understood: { type: 'string' },
        in_scope_ids: { type: 'array', items: { type: 'integer' } },
        unmatched_reason: { type: 'string' },
      },
      required: ['in_scope_ids'],
    },
  },
  required: ['app_summary', 'launch_contract', 'monitoring_contract', 'flow_inventory', 'focus_map'],
}

const OBSERVATIONS_SCHEMA = {
  type: 'object',
  properties: {
    iteration: { type: 'integer' },
    launched: { type: 'boolean' },
    launch_notes: { type: 'string' },
    build_identity: { type: 'string' },
    flows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          steps_taken: { type: 'string' },
          observed: { type: 'string' },
          evidence_files: { type: 'array', items: { type: 'string' } },
          completed: { type: 'boolean' },
          blocked_reason: { type: 'string' },
        },
        required: ['id', 'steps_taken', 'observed', 'completed'],
      },
    },
    anomalies_noted: { type: 'array', items: { type: 'string' } },
    mutating_actions: { type: 'array', items: { type: 'string' } },
    teardown_ok: { type: 'boolean' },
    teardown_notes: { type: 'string' },
  },
  required: ['iteration', 'launched', 'flows', 'teardown_ok'],
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    iteration: { type: 'integer' },
    monitoring_read: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          flow_id: { type: 'string' },
          what_was_done: { type: 'string' },
          expected: { type: 'string' },
          expected_source: { type: 'string' },
          actual: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          repro: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['title', 'what_was_done', 'expected', 'expected_source', 'actual', 'severity', 'repro'],
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          context: { type: 'string' },
          why_unclear: { type: 'string' },
        },
        required: ['title', 'context', 'why_unclear'],
      },
    },
    covered: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['flow_id', 'note'],
      },
    },
    leads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          exercise: { type: 'string' },
          expectation: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['area', 'exercise', 'why'],
      },
    },
  },
  required: ['iteration', 'findings', 'questions', 'covered', 'leads'],
}

const CONFIRM_SCHEMA = {
  type: 'object',
  properties: {
    reproduced: { type: 'boolean' },
    evidence: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['reproduced', 'evidence'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['solid', 'rough', 'broken', 'not-runnable'] },
    evidence_basis: { type: 'string', enum: ['monitoring-backed', 'surface-only'] },
    headline: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          what_was_done: { type: 'string' },
          expected: { type: 'string' },
          expected_source: { type: 'string' },
          actual: { type: 'string' },
          repro: { type: 'string' },
          evidence: { type: 'string' },
          repro_confirmed: { type: 'string', enum: ['yes', 'no', 'not-run'] },
        },
        required: ['title', 'severity', 'what_was_done', 'expected', 'expected_source', 'actual', 'repro', 'repro_confirmed'],
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          context: { type: 'string' },
          why_unclear: { type: 'string' },
        },
        required: ['title', 'context', 'why_unclear'],
      },
    },
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          rationale: { type: 'string' },
          related_finding: { type: 'string' },
        },
        required: ['action', 'rationale'],
      },
    },
    checked: { type: 'array', items: { type: 'string' } },
    not_checked: { type: 'array', items: { type: 'string' } },
    stop_reason: { type: 'string' },
  },
  required: ['verdict', 'evidence_basis', 'headline', 'findings', 'questions', 'proposals', 'checked', 'not_checked', 'stop_reason'],
}

// The standalone document is a SEPARATE agent's only output. Asking the synthesis agent for
// both the structure and a full re-narration of it in one response cost the document: with
// 39 findings already emitted it answered the markdown field with "« see below »", and the
// saved report — the deliverable the user actually opens — was 13 bytes.
const DOCUMENT_SCHEMA = {
  type: 'object',
  properties: { report_markdown: { type: 'string' } },
  required: ['report_markdown'],
}

// Expose the pure helpers to any module loader (the Node unit tests in
// tests/project-auto-work/script-tests use this). Assigned before the orchestration below
// so it is reached whichever path that takes.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeArgs, dialFor, reconAbort, composeBatch, leadId, isDry,
    evidenceBasis, stampBasis, notCheckedList,
    buildDrift, isUsableMarkdown, renderFallbackMarkdown,
    LEVELS, DIALS, DRY_LIMIT, AGGRESSION_BRIEF,
  }
}

// ---------------------------------------------------------------------------
// Orchestration — runs only under the Workflow runtime, which injects the `agent`
// hook (plus args/log/phase). Without that hook the runtime contract is broken, so
// we throw rather than silently no-op (see the else).
// ---------------------------------------------------------------------------

if (typeof agent === 'function') {
  const cfg = normalizeArgs(args)
  if (cfg.error) {
    // A bail-out return surfaces to the harness as status:completed, so echo what we
    // received to make the failure diagnosable rather than a silent no-op.
    log(`test-app: ${cfg.error} (args arrived as type "${typeof args}", keys: ${cfg.receivedKeys.join(', ') || 'none'})`)
    return { error: cfg.error, got: { type: typeof args, keys: cfg.receivedKeys, repoRoot: cfg.repoRoot } }
  }

  const { repoRoot, focus, level, dial, scratchDir, breakItFile } = cfg

  // ── The standalone document — its own agent, with a deterministic fallback.
  // Nothing downstream may receive a placeholder: SKILL.md writes this string to a file and
  // states its path, so an unusable one is a silently empty deliverable.

  const writeDocument = async (report, context) => {
    const doc = await agent(
      `Write the standalone report document for an exploratory application test of ${repoRoot}.\n` +
      `Writing this document is your ONLY job — the analysis is finished and is given to you below. Do not re-judge it, ` +
      `do not add findings, do not drop any.\n\n` +
      `${context}\n\n` +
      `THE FINISHED REPORT:\n${JSON.stringify(report, null, 2)}\n\n` +
      `Produce report_markdown: the whole report as one Markdown document a reader can open on its own, with no access to this run — ` +
      `what the application is, how it was exercised, the verdict and why it was earned, every finding with its repro steps and evidence, ` +
      `the open questions, the proposals, what was covered and what was NOT, and the setup (level, focus, stop reason, evidence basis).\n` +
      `Include EVERY finding — all ${((report && report.findings) || []).length} of them, each with its full repro and evidence. ` +
      `This string is written to a file verbatim and is the only thing most readers will see: a pointer such as "see above" or "see the structured report" ` +
      `leaves them with an empty file. Write the content out.`,
      { label: 'document', phase: 'Synthesis', schema: DOCUMENT_SCHEMA, effort: 'high' }
    )
    const md = doc && doc.report_markdown
    if (isUsableMarkdown(md, report)) return md
    log(`Document agent returned ${md ? `${md.trim().length} chars` : 'nothing'} for ${((report && report.findings) || []).length} finding(s) — assembling the document from the structured report instead.`)
    return renderFallbackMarkdown(report, { repoRoot, level, focus })
  }

  // ── Abort helper — every abort IS a report, carrying the remediation.

  const abortReport = async (reason, evidence, remediationHint) => {
    phase('Synthesis')
    const report = await agent(
      `The exploratory application test of ${repoRoot} could not run. Produce the abort report — ` +
      `it is a REMEDIATION report, not an error message: the proposals must tell the user exactly what to change ` +
      `so the run becomes possible.\n\n` +
      `Abort reason: ${reason}\n` +
      `Evidence:\n${evidence}\n` +
      `Remediation direction: ${remediationHint}\n\n` +
      `Rules: verdict is 'not-runnable'. evidence_basis is 'surface-only'. ` +
      `One finding (severity blocker, repro_confirmed 'not-run') carrying the evidence verbatim. ` +
      `Each proposal is one concrete action — name the file to edit and the content to add where the evidence allows it. ` +
      `checked lists the little that WAS done (the docs recon); not_checked states that the application was never launched. ` +
      `stop_reason is "abort:${reason}".`,
      { label: 'abort-report', phase: 'Synthesis', schema: REPORT_SCHEMA }
    )
    if (!report) {
      return { error: `run aborted (${reason}) and the abort-report agent also failed`, repoRoot, level, focus, aborted: true, abort_reason: reason, scratchDir }
    }
    report.report_markdown = await writeDocument(report,
      `The run ABORTED before the application was ever launched. Reason: ${reason}. ` +
      `The document is a remediation notice: its job is to tell the reader exactly what to change so a run becomes possible.`)
    return { repoRoot, level, focus, aborted: true, abort_reason: reason, report, scratchDir }
  }

  // ── Phase 1 — Recon: learn the app the way a user would

  phase('Recon')

  const recon = await agent(
    `You are the recon agent of an exploratory application test of ${repoRoot}.\n` +
    `You do NOT launch or run the application. You read, and you produce the contracts the rest of the run depends on.\n\n` +
    `WHAT YOU MAY READ — and this constraint is the point of the whole exercise:\n` +
    `  - The project's USER-FACING documentation: README, user guides, command references, help text captured in docs, ` +
    `changelog entries describing behaviour. What the application is for, what it promises, how someone is meant to use it.\n` +
    `  - The project's own docs on how to RUN it and how to read its MONITORING data — wherever this project puts them.\n` +
    `WHAT YOU MUST NOT USE AS A SOURCE OF EXPECTED BEHAVIOUR:\n` +
    `  - The source code. The test suite. Architecture or contributor documentation.\n` +
    `An agent that has read the implementation judges the application against what the code does, which is always true of it — ` +
    `so it can no longer find a bug. The yardstick has to come from outside the implementation. Do not read the source.\n\n` +
    `Produce four things:\n\n` +
    `1. LAUNCH CONTRACT — how to start this application, how to know it is ready, how to stop it. ` +
    `Take it VERBATIM from what the project documents. This skill carries no knowledge of any language, framework or project type, ` +
    `and it must not acquire any here: do NOT infer a start command from a manifest, a lockfile, a Makefile target you guessed at, ` +
    `or from what applications of this kind usually do. If the project does not state how to run it, set complete=false and put in ` +
    `\`missing\` exactly which of the three parts is absent. That is a correct and useful answer — the run will stop and tell the user what to document.\n` +
    `Set complete=true only when start_cmd is documented AND you can state a readiness check AND a teardown ` +
    `(for a command-line application that exits on its own, the readiness check is "the process exits" and teardown is "none needed" — say so).\n` +
    `Keep each field to its own job — several agents follow this contract independently, and a field that carries someone else's content gets read past:\n` +
    `  - build_cmd: the one-time build or install step, if the project documents one. Empty when the app runs without one.\n` +
    `  - start_cmd: the command that runs the application. A command, not a procedure.\n` +
    `  - version_check: a command printing which build is running (a version flag, a build stamp). Every iteration runs this and reports the result, ` +
    `so a run cannot silently test two different builds and compare their findings. Empty only if the project exposes no such command.\n` +
    `  - isolation: how to exercise the app WITHOUT writing into the user's real data, when the project's own docs establish that risk and the way around it ` +
    `(a store-resolution rule, a config-path or home-directory override, a documented test/scratch mode). This is not a safety policy imposed by this skill — ` +
    `it is a fact about the application, taken from its docs like everything else. Empty when the project documents nothing of the kind.\n` +
    `Record where you found all of it in \`source\`.\n\n` +
    `2. MONITORING CONTRACT — how to read this application's logs, metrics, traces or spans, again ONLY as the project documents it. ` +
    `For each source: its name, how to read it (the exact command or path), and live_only=true if it can only be read while the application is running ` +
    `(so the driver must capture it before shutting down) or false if it persists afterwards. ` +
    `If the project documents no monitoring, set available=false and say why in why_absent. The run continues — it will report that it could only see the surface.\n\n` +
    `3. FLOW INVENTORY — the things this application can do, as a user would describe them, drawn from the user-facing docs. ` +
    `Each entry: the area, what to exercise (concretely enough that another agent could do it without re-reading the docs), ` +
    `the expectation (what the docs say or imply should happen), and the doc source. Aim for 8-20 entries; order them by how central they are to the application's stated purpose.\n\n` +
    `4. FOCUS MAP — ${focus
      ? `the user asked to focus on: "${focus}".\n` +
        `If that names a doc file, read it: it is BOTH the scope and the yardstick — every claim it makes becomes an expectation to verify, ` +
        `and the application disagreeing with it is a finding (note in expectation which side you believe is wrong).\n` +
        `Put in in_scope_ids the 0-based indices of the flow_inventory entries the focus covers, and restate the focus in focus_understood. ` +
        `If the focus matches NOTHING in this application, return in_scope_ids as an empty array and explain in unmatched_reason. ` +
        `Do not stretch a near-match: the run will stop and show the user what does exist, which is more useful than testing the wrong area.`
      : `no focus was given, so the run exercises the application broadly. Return in_scope_ids listing the 0-based index of EVERY flow_inventory entry, ` +
        `and set focus_understood to "no focus given — exercise the application broadly".`}\n\n` +
    `Also record app_summary (what this application is, in a user's words) and docs_read (which files you actually read).`,
    { label: 'recon', phase: 'Recon', schema: RECON_SCHEMA }
  )

  if (!recon) return { error: 'recon agent failed — nothing was launched', repoRoot, level, focus }

  log(`Recon: ${((recon.flow_inventory || []).length)} flow(s) identified; ` +
      `launch=${recon.launch_contract && recon.launch_contract.complete ? 'documented' : 'MISSING'}; ` +
      `monitoring=${recon.monitoring_contract && recon.monitoring_contract.available ? (recon.monitoring_contract.sources || []).length + ' source(s)' : 'none'}`)

  const gate = reconAbort(recon, focus)
  if (gate) return await abortReport(gate.reason, gate.evidence, gate.remediation)

  const launch = recon.launch_contract
  const monitoring = recon.monitoring_contract || { available: false }
  const basis = evidenceBasis(monitoring)

  // Scope the inventory to the focus, then give every flow a stable id. Ids travel through
  // driver, analyst and the coverage ledger, so they are minted once here.
  const inScope = new Set((recon.focus_map && recon.focus_map.in_scope_ids) || [])
  const inventory = (recon.flow_inventory || [])
    .map((f, i) => ({ ...f, id: `flow-${i + 1}`, origin: 'recon', index: i }))
    .filter(f => inScope.size === 0 || inScope.has(f.index))

  if (inventory.length === 0) {
    return await abortReport(
      'recon identified no exercisable flow in this application',
      `The project's user-facing docs yielded no concrete thing to exercise.\nDocs read: ${recon.docs_read || '(none reported)'}\nApp summary: ${recon.app_summary || '(none)'}`,
      'Document what this application does from a user\'s point of view — a README usage section listing its actual operations is enough — then re-run.'
    )
  }

  const monitoringBrief = monitoring.available
    ? `MONITORING SOURCES (as this project documents them${monitoring.source_doc ? `, in ${monitoring.source_doc}` : ''}):\n` +
      (monitoring.sources || []).map(s => `  - ${s.name} [${s.live_only ? 'LIVE ONLY — capture before teardown' : 'persists after shutdown'}]: ${s.how_to_read}`).join('\n')
    : `MONITORING: this project documents none. There is nothing to capture; the analyst will judge surface behaviour only.`

  // ── Phase 2 — The loop: driver runs the app, analyst judges what it saw

  phase('Loop')

  const ledger = {
    exercised: [],       // flow ids the driver actually completed
    findings: [],        // analyst findings, iteration-stamped
    questions: [],
    iterations: [],      // per-iteration summary lines for later agents
    builds: [],          // which build each iteration actually exercised
    mutations: [],       // what the drivers actually did to the user's data
  }
  const failedIterations = []
  let stopReason = 'ceiling'
  let dryStreak = 0

  // A driver that dies mid-iteration leaves the application running against the user's
  // environment — ports held, connections open, possibly writing. Nothing else in the run
  // will clean that up, and the next iteration would launch a second instance on top of it.
  const janitor = (iteration, why) => agent(
    `You are the cleanup agent of an exploratory application test of ${repoRoot}. ` +
    `The driver of iteration ${iteration} ${why}, so the application may still be running.\n` +
    `Documented teardown: ${launch.teardown_cmd || '(none documented)'}\n` +
    `Check whether the application is still running and stop it using the documented teardown. ` +
    `If nothing is running, do nothing. Do not kill unrelated processes, and do not touch the project's files.\n` +
    `Report in one short paragraph what you found and what you stopped.`,
    { label: `janitor-${iteration}`, phase: 'Loop', schema: {
        type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } }
  )

  for (let i = 1; i <= dial.ceiling; i++) {
    const batch = composeBatch(inventory, ledger.exercised, dial.flows)
    if (batch.length === 0) {
      stopReason = 'exhausted'
      log(`Iteration ${i}: every planned flow has been exercised — stopping.`)
      break
    }

    const iterDir = `${scratchDir}/iter-${i}`
    const batchBrief = batch.map(f => `  [${f.id}] ${f.area} — ${f.exercise}\n      expected: ${f.expectation}${f.doc_source ? ` (source: ${f.doc_source})` : ''}${f.why ? `\n      raised as a lead because: ${f.why}` : ''}`).join('\n')

    const observations = await agent(
      `You are the driver of iteration ${i} of an exploratory application test of ${repoRoot}.\n` +
      `You USE the application. You do not judge it — a separate analyst does that, and it needs your raw observations, not your conclusions.\n\n` +
      `THE APPLICATION: ${recon.app_summary}\n\n` +
      `LAUNCH CONTRACT (from the project's own docs — follow it verbatim, do not improvise a different way to start it, ` +
      `and do not substitute an equivalent you find more convenient: every iteration must exercise the SAME build, or their findings cannot be compared):\n` +
      (launch.build_cmd ? `  build:    ${launch.build_cmd}\n` : '') +
      `  start:    ${launch.start_cmd}\n` +
      (launch.version_check ? `  version:  ${launch.version_check}   ← run this and put the output in build_identity\n` : '') +
      `  ready:    ${launch.ready_check || '(none documented — treat a clean start as ready)'}\n` +
      `  teardown: ${launch.teardown_cmd || '(none documented)'}\n` +
      (launch.isolation ? `  isolation: ${launch.isolation}\n` : '') + `\n` +
      `${monitoringBrief}\n\n` +
      `YOUR ASSIGNED FLOWS this iteration — exercise exactly these, in order:\n${batchBrief}\n\n` +
      `AGGRESSION (level=${level}): ${AGGRESSION_BRIEF[dial.aggression]}\n` +
      (dial.aggression === 'happy-path' ? '' : `Read ${breakItFile} before you start and use it as instinct-prompting against your assigned flows.\n`) +
      `\nSTAY ON THE PLAN. If you notice something odd outside your assigned flows, RECORD it in anomalies_noted and move on — ` +
      `do not chase it. An analyst turns anomalies into work for a later iteration; an unplanned detour here would leave the run unable to say what it covered.\n\n` +
      `NO CONSTRAINTS ON THE APPLICATION ITSELF: you are testing it for real, against whatever environment it is configured for. ` +
      `Creating, changing, deleting and sending real data is expected — the user has accepted that. ` +
      `List every mutating action you performed in mutating_actions, so the report can tell the user what happened to their data.\n\n` +
      `PROCEDURE:\n` +
      `1. mkdir -p ${iterDir}\n` +
      `2. Launch the application per the contract, then run its version_check and record the output verbatim in build_identity. ` +
      `If it will not start, set launched=false, explain in launch_notes, and return — do not improvise another way in.\n` +
      `3. Exercise each assigned flow. For each, record steps_taken (the exact commands or actions, reproducible by someone else) and ` +
      `observed (what actually happened — output, errors, timings, screen state; verbatim excerpts, not a summary). Set completed=false with blocked_reason if you could not do it.\n` +
      `   If a flow's real interface is one you cannot operate from a shell, say so in blocked_reason rather than substituting a different interface. Do not pretend to have used it.\n` +
      `4. CAPTURE EVIDENCE before shutting anything down: write every monitoring source marked LIVE ONLY into ${iterDir}/, ` +
      `and list the files you wrote in each flow's evidence_files. Sources that persist after shutdown do not need capturing — the analyst reads those itself.\n` +
      `5. Tear down per the contract. Set teardown_ok and describe anything left behind in teardown_notes.\n\n` +
      `Report what you saw. No verdicts, no severities, no conclusions — those are the analyst's, and yours would bias them.`,
      { label: `driver-${i}`, phase: 'Loop', schema: OBSERVATIONS_SCHEMA }
    )

    if (!observations || !observations.launched) {
      const why = observations ? 'could not launch the application' : 'died mid-run'
      const j = await janitor(i, why)
      if (j) log(`Janitor ${i}: ${j.summary}`)
      failedIterations.push(i)
      ledger.iterations.push(`iteration ${i}: ${why}${observations && observations.launch_notes ? ` — ${observations.launch_notes}` : ''}`)
      log(`Iteration ${i}: driver ${why}.`)
      // A launch that fails on the first iteration will fail on every one; the contract is
      // the same each time. Stop rather than burning the ceiling on the same failure.
      if (i === 1) {
        stopReason = 'abort:the documented launch command did not start the application'
        break
      }
      continue
    }

    ledger.builds.push({ iteration: i, build_identity: observations.build_identity || '' })
    ;(observations.mutating_actions || []).forEach(a => ledger.mutations.push({ iteration: i, action: a }))

    if (!observations.teardown_ok) {
      const j = await janitor(i, 'reported an incomplete teardown')
      if (j) log(`Janitor ${i}: ${j.summary}`)
    }

    const analysis = await agent(
      `You are the analyst of iteration ${i} of an exploratory application test of ${repoRoot}.\n` +
      `You never launch the application and never operate it. The driver already did that; re-running it would waste the run and change the state you are judging.\n\n` +
      `PUT YOURSELF IN THE USER'S SHOES. You are a human tester asking, of everything below: was that what a reasonable user would expect? ` +
      `Is this acceptable in normal use? What would make it meaningfully better? Judge the experience, not the implementation.\n\n` +
      `THE APPLICATION: ${recon.app_summary}\n\n` +
      `WHAT THE DRIVER DID AND SAW:\n${JSON.stringify(observations, null, 2)}\n\n` +
      `${monitoringBrief}\n` +
      (monitoring.available
        ? `Read the monitoring data now: the driver captured the live-only sources into ${iterDir}/ (see evidence_files); read the persisting sources yourself using the commands above. ` +
          `Correlate what the user saw with what the system recorded. A clean screen over an error in the log is a finding — it is the most valuable kind this run can produce.\n`
        : `There is no monitoring to read. Judge the surface behaviour only, and do not speculate about internal causes you have no evidence for.\n`) +
      `\nWHAT THE APPLICATION IS SUPPOSED TO DO — your yardstick, in this order of authority:\n` +
      `  1. The project's user-facing documentation (each flow above carries the documented expectation and its source).\n` +
      `  2. What a reasonable user would expect if the docs are silent.\n` +
      `THE SOURCE CODE IS NOT A YARDSTICK. You may open a source file ONLY to explain a failure that is already on the record above — ` +
      `a crash the driver saw, a stack trace in a log — and then only to say where and why it happened. ` +
      `You may never use the code to decide whether something is correct: code that does X is not evidence that X is right.\n\n` +
      `ALREADY KNOWN — do not re-report these:\n` +
      (ledger.findings.length ? ledger.findings.map(f => `  - ${f.title}`).join('\n') : '  (nothing yet)') + '\n' +
      (ledger.questions.length ? ledger.questions.map(q => `  - (question) ${q.title}`).join('\n') + '\n' : '') +
      `\nProduce:\n` +
      `- findings: things that are broken, wrong, or would surprise a reasonable user. Each states what was done, what was expected AND where that expectation comes from ` +
      `(a doc quote, or "reasonable user expectation"), what actually happened, a severity, a repro another person could follow, and the evidence (log excerpt, output, monitoring correlation). ` +
      `A finding must rest on something in the record above — never on what you assume the code does.\n` +
      `- questions: genuine ambiguity you cannot resolve from the user-facing docs. Not defects — things a human should decide. Do not inflate a question into a finding.\n` +
      `- covered: one line per assigned flow saying what was actually established about it.\n` +
      `- leads: concrete things a later iteration should exercise, drawn from the driver's anomalies_noted or from what the monitoring data suggests. ` +
      `Each must be as concrete as a flow: an area and exactly what to exercise. These become assigned flows — an unclear lead is a wasted iteration.\n` +
      `- monitoring_read: what you actually read, or why you read nothing.\n\n` +
      `If the iteration genuinely produced nothing worth reporting, return empty arrays. Do not manufacture a finding to look productive — ` +
      `a quiet iteration is a real result, and the run stops early on two of them.`,
      { label: `analyst-${i}`, phase: 'Loop', schema: ANALYSIS_SCHEMA }
    )

    if (!analysis) {
      failedIterations.push(i)
      ledger.iterations.push(`iteration ${i}: driver completed, but the analyst died — its observations were never judged`)
      log(`Iteration ${i}: analyst failed; observations unjudged.`)
      continue
    }

    // Coverage is what the DRIVER completed, not what the analyst claims: an analyst
    // listing a flow it never received would silently shrink the not-checked list.
    const completed = (observations.flows || []).filter(f => f.completed).map(f => f.id)
    ledger.exercised.push(...completed)
    ledger.findings.push(...(analysis.findings || []).map(f => ({ ...f, iteration: i })))
    ledger.questions.push(...(analysis.questions || []))

    // Leads become explicit, planned flows for a later iteration — the driver still only
    // ever executes an assigned flow.
    ;(analysis.leads || []).forEach((lead, n) => {
      inventory.push({
        id: leadId(i, n),
        area: lead.area,
        exercise: lead.exercise,
        expectation: lead.expectation || 'no documented expectation — judge as a reasonable user would',
        why: lead.why,
        origin: 'lead',
      })
    })

    ledger.iterations.push(
      `iteration ${i}: exercised ${completed.length}/${batch.length} assigned flow(s) [${batch.map(f => f.id).join(', ')}]; ` +
      `${(analysis.findings || []).length} finding(s), ${(analysis.questions || []).length} question(s), ${(analysis.leads || []).length} lead(s)`
    )
    log(ledger.iterations[ledger.iterations.length - 1])

    if (isDry(analysis)) {
      dryStreak += 1
      if (dryStreak >= DRY_LIMIT) {
        stopReason = 'dry'
        log(`Stopping early: ${DRY_LIMIT} consecutive iterations produced nothing new.`)
        break
      }
    } else {
      dryStreak = 0
    }
  }

  // ── Phase 3 — Repro-confirm (ultra only): re-run each finding alone

  let confirmed = ledger.findings.map(f => ({ ...f, repro_confirmed: 'not-run' }))

  if (dial.confirm && ledger.findings.length > 0) {
    phase('Confirm')
    confirmed = []
    // Serial, like the drive loop: a confirmation run whose result could be explained by
    // another agent touching the application at the same time would confirm nothing.
    for (let n = 0; n < ledger.findings.length; n++) {
      const f = ledger.findings[n]
      const verdict = await agent(
        `You are the repro-confirmation agent of an exploratory application test of ${repoRoot}. ` +
        `Your only job is to establish whether ONE reported finding happens again when nothing else is touching the application.\n\n` +
        `LAUNCH CONTRACT (follow verbatim):\n  start: ${launch.start_cmd}\n  ready: ${launch.ready_check || '(none documented)'}\n  teardown: ${launch.teardown_cmd || '(none documented)'}\n\n` +
        `THE FINDING\n  title: ${f.title}\n  what was done: ${f.what_was_done}\n  expected: ${f.expected} (source: ${f.expected_source})\n  actual: ${f.actual}\n  repro: ${f.repro}\n\n` +
        `Launch the application, follow the repro exactly as written — do not improve it, do not substitute a similar action — observe, and tear down.\n` +
        `This runs the application for real and may mutate data, exactly as the original run did.\n` +
        `reproduced=true only if you observed the reported \`actual\` behaviour yourself. If the repro steps are too vague to follow, ` +
        `set reproduced=false and say so in notes — that is a fact about the finding's quality, and the report will show it.\n` +
        `Put what you actually observed in evidence, verbatim.`,
        { label: `confirm-${n + 1}`, phase: 'Confirm', schema: CONFIRM_SCHEMA }
      )
      confirmed.push({
        ...f,
        // A dead confirmation agent is not a failed reproduction. Saying "no" here would
        // demote a real finding on no evidence, so an unrun check stays unrun.
        repro_confirmed: verdict ? (verdict.reproduced ? 'yes' : 'no') : 'not-run',
        confirm_evidence: verdict ? verdict.evidence : 'confirmation agent failed — the finding was not re-checked',
        confirm_notes: verdict ? (verdict.notes || '') : '',
      })
    }
    const yes = confirmed.filter(f => f.repro_confirmed === 'yes').length
    log(`Confirm: ${yes}/${confirmed.length} finding(s) reproduced in isolation.`)
  }

  // ── Phase 4 — Synthesis

  phase('Synthesis')

  const notChecked = notCheckedList({
    level, dial, focus, monitoring, inventory,
    exercisedIds: ledger.exercised, stopReason, failedIterations,
  })

  const drift = buildDrift(ledger.builds)
  if (drift) {
    log(`Build drift: ${drift}`)
    notChecked.push(`a single consistent build — ${drift}`)
  }

  const raw = await agent(
    `Assemble the final report for the exploratory application test of ${repoRoot}. ` +
    `Be honest and specific; a good verdict must be earned by what was actually exercised.\n\n` +
    `THE APPLICATION: ${recon.app_summary}\n` +
    `SETUP: level=${level}, focus=${focus || '(none — broad exploration)'}, iteration ceiling ${dial.ceiling}, ` +
    `${dial.flows} flow(s) per iteration, aggression=${dial.aggression}, repro-confirm=${dial.confirm ? 'ran' : 'not run'}.\n` +
    `STOP REASON: ${stopReason}\n` +
    `EVIDENCE BASIS: ${basis}${basis === 'surface-only' ? ' — no monitoring contract; only externally visible behaviour was observed' : ''}\n\n` +
    `ITERATION LOG:\n${ledger.iterations.map(l => `  ${l}`).join('\n') || '  (no iteration completed)'}\n` +
    `BUILD EXERCISED PER ITERATION: ${ledger.builds.map(b => `${b.iteration}="${b.build_identity || 'not reported'}"`).join(', ') || 'none reported'}\n` +
    (drift ? `BUILD DRIFT — say this plainly in the headline: ${drift}\n` : '') + `\n` +
    `FINDINGS${dial.confirm ? ' (each already re-run in isolation — carry repro_confirmed through verbatim)' : ''}:\n${JSON.stringify(confirmed, null, 2)}\n\n` +
    `QUESTIONS:\n${JSON.stringify(ledger.questions, null, 2)}\n\n` +
    `FLOWS EXERCISED: ${ledger.exercised.join(', ') || '(none)'}\n` +
    `NOT-CHECKED LIST — include every entry verbatim, and add anything else you notice was missed:\n${JSON.stringify(notChecked, null, 2)}\n\n` +
    `Build the report:\n` +
    `1. findings: carry each one through with its evidence intact. Dedupe: the same problem seen twice is ONE finding with the strongest evidence. ` +
    `${dial.confirm
      ? 'repro_confirmed comes from the confirmation pass — never change it. A finding with repro_confirmed="no" stays in the report, presented as observed once and not reproduced, and cannot be a blocker.'
      : 'repro_confirmed is "not-run" for every finding — no confirmation pass runs below level=ultra. Say so where findings are presented rather than implying each was verified.'}\n` +
    `2. questions: genuine ambiguity for a human to decide. Keep them separate from findings; do not promote or demote between the two lists.\n` +
    `3. proposals: concrete actions — what to fix, what to document. Each tied to its finding or question. No code.\n` +
    `4. checked: one line per flow actually exercised, saying what was established about it. This is the honest counterweight to not_checked.\n` +
    `5. not_checked: the list above verbatim, plus anything else.\n` +
    `6. stop_reason: "${stopReason}".\n` +
    `7. evidence_basis: "${basis}". ${basis === 'surface-only'
      ? 'The headline MUST say the run was surface-only and that internal behaviour is unverified. "Nothing broke" here means "nothing visibly broke" — do not let the report imply more.'
      : 'Monitoring data was read; findings may cite it.'}\n` +
    `8. verdict: broken = something in the exercised scope fails outright or loses data; rough = it works but with real friction or defects a user would hit; ` +
    `solid = what was exercised behaved as the documentation and a reasonable user would expect, with nothing notable — this must be EARNED and is never justified by a short run alone. ` +
    `Never claim more than the coverage supports: with most of the inventory unreached, say so in the headline.\n\n` +
    `Return the structured report only — a separate agent writes the document from it, so spend your effort on the analysis and on dedupe, not on prose.`,
    { label: 'synthesis', phase: 'Synthesis', schema: REPORT_SCHEMA, effort: 'high' }
  )

  if (!raw) {
    return {
      error: 'synthesis agent failed — findings were collected but no report was assembled',
      repoRoot, level, focus, scratchDir,
      raw: { findings: confirmed, questions: ledger.questions, iterations: ledger.iterations, not_checked: notChecked },
    }
  }

  const report = stampBasis(raw, basis)

  report.report_markdown = await writeDocument(report,
    `SETUP: level=${level}, focus=${focus || 'none (broad exploration)'}, stopped: ${stopReason}, evidence basis: ${basis}.\n` +
    `THE APPLICATION: ${recon.app_summary}\n` +
    `MUTATING ACTIONS THE DRIVERS PERFORMED — include these, so the reader knows what happened to their data:\n` +
    `${JSON.stringify(ledger.mutations, null, 2)}\n` +
    (drift ? `BUILD DRIFT the reader must be told about: ${drift}` : ''))

  return {
    repoRoot,
    level,
    focus,
    evidence_basis: basis,
    stop_reason: stopReason,
    build_drift: drift,
    report,
    scratchDir,
    raw: {
      app_summary: recon.app_summary,
      launch_contract: launch,
      monitoring_contract: monitoring,
      inventory,
      exercised: ledger.exercised,
      iterations: ledger.iterations,
      builds: ledger.builds,
      mutations: ledger.mutations,
      findings: confirmed,
      questions: ledger.questions,
      not_checked: notChecked,
      failed_iterations: failedIterations,
    },
  }
} else {
  // No `agent` hook: the Workflow runtime failed to inject it. Fail LOUD — returning
  // undefined here would be recorded by the harness as status:completed, i.e. a silent
  // no-op.
  throw new Error('test-app: the Workflow runtime did not inject the `agent` hook')
}
