export const meta = {
  name: 'test-tests',
  description: 'Empirical test-suite strength audit: baseline → grouping → per-component mutation/no-op/rerun/delay probes → verify → synthesis',
  whenToUse: 'Launched by the /project-auto-work:test-tests skill. Proves whether a test suite detects bugs (mutation kill rate), stays quiet on non-bugs, is flake-free, and runs fast. Reports and proposes; never keeps an edit.',
  phases: [
    { title: 'Baseline', detail: 'test command, clean run, coverage, workspace probe' },
    { title: 'Grouping', detail: 'components: prod slice + tests + selector + churn' },
    { title: 'Hermeticity', detail: 'same slice twice in parallel — safe to parallelize?' },
    { title: 'Workers', detail: 'per component: reruns, mutants, no-ops, delays, integrity' },
    { title: 'Verify', detail: 'refute survivors as equivalent mutants (level=high only)' },
    { title: 'Synthesis', detail: 'scores, verdict, findings, proposals, checked/not-checked' },
  ],
}

// args: { repoRoot, scriptsDir, level?, scratchDir? }
// Robust to args arriving as either a parsed object or a JSON-encoded string.
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
A = A || {}
const repoRoot = A.repoRoot
const scriptsDir = A.scriptsDir
if (!repoRoot || !scriptsDir) {
  return { error: 'missing required args: repoRoot and scriptsDir must both be set', got: A }
}
const level = ['low', 'medium', 'high'].includes((A.level || '').toLowerCase())
  ? A.level.toLowerCase() : 'medium'
const scratchDir = A.scratchDir || '/tmp/test-tests-scratch'

// Dials per level (design §8). Verify pass and shuffle only at high.
const DIALS = {
  low:    { components: 3,  K: 3, M: 0, D: 0, R: 2, hermeticity: false, verify: false },
  medium: { components: 8,  K: 5, M: 2, D: 1, R: 3, hermeticity: true,  verify: false },
  high:   { components: 12, K: 8, M: 3, D: 2, R: 5, hermeticity: true,  verify: true },
}
const dial = DIALS[level]

const validateTool = `python3 "${scriptsDir}/validate-coverage-summary.py"`
const schemaRef = `${scriptsDir.replace(/\/scripts$/, '')}/references/coverage-summary-schema.md`

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const BASELINE_SCHEMA = {
  type: 'object',
  properties: {
    test_cmd: { type: 'string' },
    cmd_source: { type: 'string' },
    green: { type: 'boolean' },
    red_details: { type: 'string' },
    wall_s: { type: 'number' },
    slow_tests: { type: 'string' },
    coverage: {
      type: 'object',
      properties: {
        obtained: { type: 'boolean' },
        producer_cmd: { type: 'string' },
        producer_source: { type: 'string' },
        summary_file: { type: 'string' },
        pct: { type: 'number' },
        validation_errors: { type: 'string' },
        how_to_enable: { type: 'string' },
      },
      required: ['obtained'],
    },
    shuffle_flag: { type: 'string' },
    filter_syntax: { type: 'string' },
    can_slice: { type: 'boolean' },
    worktree_ok: { type: 'boolean' },
    worktree_setup: { type: 'string' },
    worktree_fail_reason: { type: 'string' },
    dirty_tree: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['test_cmd', 'green', 'wall_s', 'coverage', 'can_slice', 'worktree_ok', 'dirty_tree'],
}

const COMPONENTS_SCHEMA = {
  type: 'object',
  properties: {
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          prod_paths: { type: 'array', items: { type: 'string' } },
          test_selector: { type: 'string' },
          est_runtime_s: { type: 'number' },
          coverage_pct: { type: 'number' },
          churn_rank: { type: 'integer' },
        },
        required: ['name', 'prod_paths', 'test_selector'],
      },
    },
    rationale: { type: 'string' },
  },
  required: ['components'],
}

const HERMETICITY_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    output_digest: { type: 'string' },
    symptoms: { type: 'string' },
  },
  required: ['passed', 'output_digest'],
}

const WORKER_SCHEMA = {
  type: 'object',
  properties: {
    component: { type: 'string' },
    audited: { type: 'boolean' },
    not_audited_reason: { type: 'string' },
    slice_wall_s: { type: 'number' },
    flakes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { test: { type: 'string' }, symptom: { type: 'string' } },
        required: ['test', 'symptom'],
      },
    },
    mutants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          diff: { type: 'string' },
          stated_behavior_change: { type: 'string' },
          outcome: { type: 'string', enum: ['KILLED', 'SURVIVED'] },
          killed_by: { type: 'string' },
          implication: { type: 'string' },
        },
        required: ['file', 'line', 'diff', 'stated_behavior_change', 'outcome'],
      },
    },
    noops: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          diff: { type: 'string' },
          broke: { type: 'boolean' },
          broken_tests: { type: 'array', items: { type: 'string' } },
        },
        required: ['file', 'diff', 'broke'],
      },
    },
    delays: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          broke: { type: 'boolean' },
          broken_tests: { type: 'array', items: { type: 'string' } },
        },
        required: ['file', 'line', 'broke'],
      },
    },
    integrity_ok: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['component', 'audited', 'integrity_ok'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['refuted'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['strong', 'adequate', 'weak', 'untrustworthy', 'not-auditable'] },
    headline: { type: 'string' },
    scores: {
      type: 'object',
      properties: {
        kill_rate: { type: 'number' },
        brittle_breaks: { type: 'integer' },
        flaky_tests: { type: 'integer' },
        timing_sensitive: { type: 'integer' },
        suite_wall_s: { type: 'number' },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          axis: { type: 'string', enum: ['sensitivity', 'specificity', 'reliability', 'timing', 'speed', 'auditability'] },
          component: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          observation: { type: 'string' },
          evidence: { type: 'string' },
          implication: { type: 'string' },
          candidate: { type: 'boolean' },
        },
        required: ['axis', 'severity', 'observation', 'evidence', 'implication', 'candidate'],
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
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kill_rate: { type: 'number' },
          flakes: { type: 'integer' },
          brittle: { type: 'integer' },
          slice_wall_s: { type: 'number' },
          audited: { type: 'boolean' },
        },
        required: ['name', 'audited'],
      },
    },
    checked: { type: 'string' },
    not_checked: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'headline', 'findings', 'proposals', 'checked', 'not_checked'],
}

// ---------------------------------------------------------------------------
// Abort helper — every abort IS a report (remediation proposals filled in).
// ---------------------------------------------------------------------------

async function abortReport(reason, evidence, remediationHint) {
  phase('Synthesis')
  const report = await agent(
    `The test-suite strength audit of ${repoRoot} could not run. Produce the abort report — ` +
    `it is a REMEDIATION report, not an error message: the proposals must tell the user exactly ` +
    `how to make this repo auditable.\n\n` +
    `Abort reason: ${reason}\n` +
    `Evidence:\n${evidence}\n` +
    `Remediation direction: ${remediationHint}\n\n` +
    `Rules: verdict is '${reason.startsWith('suite is red') ? 'untrustworthy' : 'not-auditable'}'. ` +
    `One finding on axis '${reason.startsWith('suite is red') ? 'reliability' : 'auditability'}' (severity blocker, candidate false) carrying the evidence verbatim. ` +
    `Each proposal is one concrete action with its exact command or edit where derivable from the evidence ` +
    `(e.g. the coverage invocation to add, the failing test to quarantine, the slow tests to exclude from the audited command). ` +
    `checked describes the little that WAS done; not_checked lists every audit axis that never ran.`,
    { label: 'abort-report', phase: 'Synthesis', schema: REPORT_SCHEMA }
  )
  return { repoRoot, level, aborted: true, abort_reason: reason, report, scratchDir }
}

// ---------------------------------------------------------------------------
// Phase 1 — Discovery, baseline, coverage, workspace probe
// ---------------------------------------------------------------------------

phase('Baseline')

const READ_ONLY_RULES =
  `HARD CONSTRAINTS: you are working against the user's live repository at ${repoRoot}. ` +
  `Do not create, modify, or delete any file inside it. Do not change git state (no commit, branch, ` +
  `stash, checkout, push). Never install packages into the repo or globally. Coverage/test artifacts the ` +
  `suite itself drops (e.g. an untracked coverage file or cache) are acceptable. ` +
  `Write everything you produce under ${scratchDir} (run \`mkdir -p ${scratchDir}\` first). ` +
  `Every command must finish within the 600 s Bash cap. When a command's duration is unknown ` +
  `(e.g. the first full suite run), wrap it in \`timeout 590 <cmd>\` so it terminates cleanly inside the cap.`

const baseline = await agent(
  `You are the baseline agent of a language-independent test-suite strength audit.\n` +
  `Target repository: ${repoRoot}\n${READ_ONLY_RULES}\n\n` +
  `Do the following, in order:\n\n` +
  `1. DISCOVER the test command from the project's OWN documentation and config — its testing/contributor/agent docs, ` +
  `README, build and task files, package manifests, CI workflows: whatever this repo itself provides. ` +
  `Use exactly what the repo documents; never invent a framework invocation it doesn't document. Record where you found it (cmd_source).\n\n` +
  `2. BASELINE RUN: run the command once, cleanly, in the live tree, wrapped in \`timeout 590\`. Time it (wrap with \`date +%s\` or the runner's own timing). ` +
  `If the timeout kills it, record wall_s=601 (meaning "exceeds the cap"), green=false, and note the timeout in notes — that IS a valid measurement, not a failure of yours. ` +
  `If it is RED, capture the failing tests' names and output excerpt in red_details, set green=false, and still attempt steps 4-6 cheaply if possible; accuracy of red_details matters most.\n` +
  `Also capture per-test timings if the runner offers them cheaply (a timing/durations flag or reporter it already has); summarize the slowest tests in slow_tests. ` +
  `If the runner offers no per-test timing output, record that fact in slow_tests and MOVE ON — do not dig for it.\n\n` +
  `3. COVERAGE: this audit does NOT parse coverage formats. The repository must provide a command that emits a coverage summary as JSON on stdout, ` +
  `in the neutral schema documented at ${schemaRef} (a "files" array of {repo-relative path, covered_ranges, uncovered_ranges}). ` +
  `DISCOVER that command the same way you found the test command — from the project's OWN docs (testing/contributor/agent docs, README, task files); ` +
  `record it in producer_cmd and where you found it in producer_source. Do not invent one the repo does not document, and never install anything.\n` +
  `Run it (wrapped in \`timeout 590\`), capture stdout to ${scratchDir}/coverage_raw.json, then validate + normalize:\n` +
  `   ${validateTool} ${scratchDir}/coverage_raw.json --repo-root ${repoRoot} > ${scratchDir}/coverage_summary.json\n` +
  `CONTRACT: obtained=true is valid ONLY if the validator exits 0 AND ${scratchDir}/coverage_summary.json exists — then fill summary_file and pct (the summary's totals.pct).\n` +
  `If the repo documents NO such command, set obtained=false and put into how_to_enable exactly what to add (a command emitting the schema at ${schemaRef}, and where to document it).\n` +
  `If a command exists but the validator REJECTS its output (exit 3), set obtained=false, record the command in producer_cmd, and put the validator's stderr verbatim into validation_errors.\n\n` +
  `4. RUNNER FEATURES: record the runner's native order-shuffle flag if one exists (only a flag/plugin that is ALREADY available — never install one) ` +
  `in shuffle_flag, and the test-filter syntax (however this runner selects a subset — a path, a name filter, a package pattern) in filter_syntax. ` +
  `Set can_slice=true only after PROVING it by actually running one small subset.\n\n` +
  `5. WORKSPACE PROBE: create a throwaway worktree and check the suite runs there:\n` +
  `   git -C ${repoRoot} worktree add ${scratchDir}/probe-wt HEAD\n` +
  `   (run the test command inside ${scratchDir}/probe-wt)\n` +
  `A fresh worktree contains ONLY committed files, and suites often depend on uncommitted, gitignored runtime state. ` +
  `So if the suite fails in the worktree although it was green in the live tree, that is a WORKSPACE defect, not a suite defect: ` +
  `diagnose from the actual error what uncommitted state the suite needs, make it available from the live checkout by linking or copying ` +
  `(never install anything, never write to the live checkout), and re-run. Record the exact repair commands VERBATIM in worktree_setup — ` +
  `later agents replay them in their own worktrees, adjusting only the worktree path.\n` +
  `worktree_ok=true only if the suite ends as green there as in the live tree (with at most that repair); worktree_fail_reason must then stay empty. ` +
  `If you cannot reach green, set worktree_ok=false with the diagnosis in worktree_fail_reason — the audit will then run sequentially in the live tree.\n` +
  `When done: git -C ${repoRoot} worktree remove --force ${scratchDir}/probe-wt\n\n` +
  `6. Record dirty_tree = whether \`git -C ${repoRoot} status --porcelain\` is non-empty.\n\n` +
  `Return the structured baseline object. Be precise: every number measured, not estimated.`,
  { label: 'baseline', phase: 'Baseline', schema: BASELINE_SCHEMA }
)

if (!baseline) return { error: 'baseline agent failed', repoRoot, level }

log(`Baseline: cmd="${baseline.test_cmd}" green=${baseline.green} wall=${baseline.wall_s}s ` +
    `coverage=${baseline.coverage.obtained ? ((baseline.coverage.pct != null ? baseline.coverage.pct : '?') + '%') : 'NONE'} ` +
    `worktree_ok=${baseline.worktree_ok} can_slice=${baseline.can_slice}`)

// Abort gates — each abort is a remediation report. Order matters: a timed-out
// baseline (wall_s > 600) reports green=false too, so the speed gate goes first.
if (baseline.wall_s > 600) {
  return await abortReport(
    'suite too slow to audit — the baseline run did not finish within the 600 s cap',
    `Command: ${baseline.test_cmd}\nBaseline run: killed by timeout (> 600 s), so its pass/fail state is unknown\n` +
    `Filter syntax: ${baseline.filter_syntax || 'none found'} (can_slice=${baseline.can_slice})\n` +
    `Slowest tests (from baseline timing data): ${baseline.slow_tests || 'not captured'}`,
    'Speed the suite up, or scope the audit to a subdirectory with its own faster suite; the slowest tests in the evidence are the first candidates to exclude from the audited command.'
  )
}
if (!baseline.green) {
  return await abortReport(
    'suite is red at baseline — unauditable',
    `Command: ${baseline.test_cmd}\nFailures:\n${baseline.red_details || '(none captured)'}`,
    'Fix or quarantine the failing tests so the suite is green, then re-run the audit. Name each failing test and the quarantine/skip mechanism this runner supports.'
  )
}
if (!baseline.coverage.obtained || !baseline.coverage.summary_file) {
  const noProducer = !baseline.coverage.producer_cmd
  return await abortReport(
    'coverage summary unavailable — audit would mutate blind',
    `Command: ${baseline.test_cmd}\n` +
    (noProducer
      ? `No coverage-summary command is documented in this repo. The audit needs one that emits the neutral schema on stdout.\n` +
        `How to enable: ${baseline.coverage.how_to_enable || '(agent found no route)'}`
      : `Coverage command: ${baseline.coverage.producer_cmd}\n` +
        `Its output did not conform to the coverage-summary schema:\n${baseline.coverage.validation_errors || '(no validator output captured)'}`),
    `The repository must expose a command that emits a coverage summary as JSON on stdout, conforming to the schema at ${schemaRef} ` +
    `(a "files" array of {repo-relative path, covered_ranges, uncovered_ranges}), documented where the test command is documented. ` +
    (noProducer
      ? 'Add and document that command, then re-run.'
      : 'Fix the command so its output conforms (the validator errors above pinpoint what to change), then re-run.')
  )
}

// ---------------------------------------------------------------------------
// Phase 2 — Grouping into components
// ---------------------------------------------------------------------------

phase('Grouping')

const grouping = await agent(
  `You are the grouping agent of a test-suite strength audit of ${repoRoot}. Read-only: do not modify anything.\n\n` +
  `Baseline facts (measured, do not re-derive): test command \`${baseline.test_cmd}\`, full-suite wall ${baseline.wall_s}s, ` +
  `filter syntax: ${baseline.filter_syntax || 'unknown'}, slowest tests: ${baseline.slow_tests || 'n/a'}.\n` +
  `Per-file coverage summary: read ${scratchDir}/coverage_summary.json (already normalized).\n\n` +
  `Partition the codebase into COMPONENTS: a component is a cohesive production-code slice plus the tests that exercise it, ` +
  `derived from directory structure, naming conventions, and the coverage summary. Do NOT rely on per-test coverage (not portable).\n` +
  `Rules:\n` +
  `- SMALL-REPO RULE (check this FIRST): if the suite runs in under ~60 s AND has fewer than ~20 test files, return exactly ONE component covering the whole suite ` +
  `(test_selector = the full command, churn_rank = 1 — skip the churn computation entirely). ` +
  `A fast suite with MANY test files still gets split into components: selectors are cheap to validate, and more components mean more mutation sites audited.\n` +
  `- Aim for 3-10 components.\n` +
  `- test_selector: the exact shell command that runs only that component's tests, built from the documented filter syntax. ` +
  `It MUST be portable: executed with the repo root (or a fresh worktree of it) as the working directory — so use repo-relative paths only, ` +
  `never absolute paths and never a leading \`cd\`. It will be validated before use.\n` +
  `- est_runtime_s: your estimate of the selector's wall time (from baseline timings where possible).\n` +
  `- coverage_pct: the component's aggregate line coverage computed from the per-file summary entries of its prod_paths — ` +
  `never totals.pct (the totals may include test helpers/fixtures and would skew the figure).\n` +
  `- churn_rank: 1 = most-churned. Compute from \`git -C ${repoRoot} log --since="6 months ago" --name-only --pretty=format:\` file-change counts aggregated per component.\n` +
  `Return the components list ordered by churn_rank (most-churned first), plus a short rationale.`,
  { label: 'grouping', phase: 'Grouping', schema: COMPONENTS_SCHEMA }
)

if (!grouping || !grouping.components || grouping.components.length === 0) {
  return await abortReport(
    'could not group the codebase into auditable components',
    'Grouping agent returned no components.',
    'Re-run at level=low (single-component mode) or scope the audit to a subdirectory.'
  )
}

const components = grouping.components.slice(0, dial.components)
const skippedComponents = grouping.components.slice(dial.components).map(c => c.name)
log(`Grouping: ${grouping.components.length} component(s), auditing ${components.length} (level=${level})` +
    (skippedComponents.length ? `, skipped: ${skippedComponents.join(', ')}` : ''))

// ---------------------------------------------------------------------------
// Phase 2b — Hermeticity probe (worktree mode only)
// ---------------------------------------------------------------------------

let mode = baseline.worktree_ok ? 'worktree' : 'live-tree'
// Parallel workers require positive hermeticity evidence; the probe only runs at
// medium/high, so low serializes even in worktree mode (safe over fast).
let parallelWorkers = mode === 'worktree' && dial.hermeticity
let hermeticityNote = ''

if (mode === 'worktree' && dial.hermeticity && components.length > 1) {
  phase('Hermeticity')
  const smallest = [...components].sort((a, b) => (a.est_runtime_s || 60) - (b.est_runtime_s || 60))[0]
  const probePrompt = (n) =>
    `Hermeticity probe ${n} of a test-suite audit. Target repo: ${repoRoot}.\n` +
    `Create a worktree, run ONE test slice in it, remove the worktree, report the outcome:\n` +
    `  git -C ${repoRoot} worktree add ${scratchDir}/herm-${n} HEAD\n` +
    (baseline.worktree_setup
      ? `  (replay the baseline's workspace setup verbatim, adjusting only the worktree path: ${baseline.worktree_setup})\n`
      : '') +
    `  cd ${scratchDir}/herm-${n} && ${smallest.test_selector}\n` +
    `  git -C ${repoRoot} worktree remove --force ${scratchDir}/herm-${n}\n` +
    `Another probe runs the SAME slice at the same time in its own worktree — do not coordinate with it.\n` +
    `Return passed (did the slice pass), output_digest (pass/fail counts + failing test names, normalized — no timestamps/durations), ` +
    `and symptoms (port clashes, shared tmp paths, database errors, file-lock errors — empty if none).`
  const probes = await parallel([
    () => agent(probePrompt(1), { label: 'hermeticity-1', phase: 'Hermeticity', schema: HERMETICITY_SCHEMA }),
    () => agent(probePrompt(2), { label: 'hermeticity-2', phase: 'Hermeticity', schema: HERMETICITY_SCHEMA }),
  ])
  const [p1, p2] = probes
  const bothPassed = p1 && p2 && p1.passed && p2.passed
  const agree = p1 && p2 && p1.output_digest === p2.output_digest
  const symptoms = [p1 && p1.symptoms, p2 && p2.symptoms].filter(Boolean).join('; ')
  if (!bothPassed || !agree || symptoms) {
    parallelWorkers = false
    hermeticityNote = `Hermeticity probe failed (passed: ${p1 && p1.passed}/${p2 && p2.passed}, ` +
      `digests ${agree ? 'agree' : 'differ'}${symptoms ? ', symptoms: ' + symptoms : ''}) — workers serialized.`
    log(hermeticityNote)
  } else {
    log('Hermeticity: concurrent runs consistent — workers run in parallel.')
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — Per-component workers
// ---------------------------------------------------------------------------

function workerPrompt(comp, idx) {
  const wt = `${scratchDir}/wt-${idx}`
  const backupDir = `${scratchDir}/backup-${idx}`
  const workspaceInstructions = mode === 'worktree'
    ? `WORKSPACE (worktree mode): create your own worktree and do ALL work inside it — the user's tree is never touched:\n` +
      `  git -C ${repoRoot} worktree add ${wt} HEAD\n` +
      `(If worktree add fails with a git lock/contention error — other workers create worktrees concurrently — retry once after a short pause.)\n` +
      (baseline.worktree_setup
        ? `Then replay the baseline's workspace setup verbatim, adjusting only the worktree path:\n  ${baseline.worktree_setup}\n`
        : '') +
      `Work in ${wt}. Apply edits, run tests, and revert freely with \`git -C ${wt} checkout -- .\` between probes.\n` +
      `WORKSPACE TRIAGE: a fresh worktree holds only committed files. If your selector fails here although the baseline was green in the live tree, ` +
      `that is a defect of YOUR WORKSPACE, not of the suite — diagnose what uncommitted state is missing from the actual error, ` +
      `link or copy it from the live checkout (never install anything, never write to the live checkout), and continue.\n` +
      `When completely done: remove any links your setup created, then git -C ${repoRoot} worktree remove --force ${wt}\n` +
      `INTEGRITY GATE: before removing, \`git -C ${wt} status --porcelain\` must be empty (ignoring untracked artifacts) and one final clean run of your selector must be green.`
    : `WORKSPACE (live-tree mode — the suite cannot run in a fresh worktree): you work in the USER'S LIVE TREE at ${repoRoot}. ` +
      `Every deviation from this protocol risks destroying the user's uncommitted work, which nothing can restore — so follow it exactly:\n` +
      `  - BEFORE touching any file, mirror its repo-relative path under the backup dir (this is collision-free — never flatten paths):\n` +
      `      mkdir -p ${backupDir}/$(dirname <relpath>) && cp -p ${repoRoot}/<relpath> ${backupDir}/<relpath>\n` +
      `  - NEVER use git checkout/restore/stash to revert — that would destroy the user's uncommitted edits. Restore ONLY by copying the backup back.\n` +
      `  - After every single probe: restore the file, then \`cmp ${repoRoot}/<relpath> ${backupDir}/<relpath>\` must succeed before you continue.\n` +
      `INTEGRITY GATE: when done, every file you touched must byte-match its backup (cmp each one) and one final clean run of your selector must be green. ` +
      `If any cmp fails, restore from the backup again, and if it still fails set integrity_ok=false and audited=false with the reason.`

  return (
    `You are the worker auditing ONE component of the test suite of ${repoRoot}.\n` +
    `Component: ${comp.name}\nProduction paths: ${JSON.stringify(comp.prod_paths)}\n` +
    `Test selector (run tests with exactly this): ${comp.test_selector}\n` +
    `Suite facts: filter syntax ${baseline.filter_syntax || 'n/a'}; shuffle flag ${baseline.shuffle_flag || 'none'}.\n` +
    `Coverage detail per file (mutate ONLY inside covered ranges):\n` +
    `  read ${scratchDir}/coverage_summary.json — one normalized document, plain JSON. Find each production file by its repo-relative path in the "files" array; ` +
    `its covered_ranges are the only mutable lines, uncovered_ranges are off-limits.\n\n` +
    `${workspaceInstructions}\n\n` +
    `Never install anything. Every command within the 600 s cap. ` +
    `Tee every selector/suite run to a log file under ${scratchDir} and extract failures/details from the log — NEVER re-run the suite just to re-read its output. ` +
    `Work SEQUENTIALLY through the protocol:\n\n` +
    `1. VALIDATE SELECTOR: run \`${comp.test_selector}\` once. It must be green and complete well under 600 s. ` +
    `If it fails, first apply the workspace triage above; if the selector itself is invalid, or the failure persists in a correctly set-up workspace, ` +
    `STOP: return audited=false with not_audited_reason describing what happened — never silently substitute a different selector. Record slice_wall_s.\n\n` +
    `2. RELIABILITY: ${baseline.shuffle_flag
      ? `run the selector ${Math.max(1, dial.R - 1)} more time(s) as-is, plus ONE run with the shuffle flag (${baseline.shuffle_flag}) using a FIXED seed you record`
      : `run the selector ${dial.R} more times`}. ` +
    `Any test whose outcome differs across runs is a flake: record {test, symptom (what differed, and the shuffle seed/order if the shuffled run exposed it)}.\n\n` +
    `3. SENSITIVITY — ${dial.K} mutants. Pick sites on COVERED lines only (check the coverage detail), preferring branch-dense, recently-churned production code; one mutant per site; spread across files where possible. ` +
    `Operators: negate a condition; flip a comparison (< ↔ <=, == ↔ !=); ±1 on a boundary constant; delete a guard clause/early return; swap same-typed arguments; replace a constant (0, 1, "", null-equivalent); && ↔ ||; delete a statement whose result is unused; return a constant instead of the computed value.\n` +
    `RULE: before applying each mutant, STATE the behavior change you believe it introduces (e.g. "empty input now passes validation"). If you cannot state one, pick a different site — never apply an edit with no statable behavior change.\n` +
    `For each mutant: apply (keep the diff ≤ ~15 lines) → run the selector → record outcome KILLED (with killed_by = the failing test) or SURVIVED (with implication = what broken behavior would ship undetected) → revert per the workspace protocol.\n\n` +
    (dial.M > 0
      ? `4. SPECIFICITY — ${dial.M} no-op edits from this whitelist ONLY: rename a local variable (function scope; skip if reflection/dynamic access nearby); extract a local constant/variable; insert an unused local statement; whitespace-only reformat of one function. ` +
        `NEVER: statement reordering, non-local renames, arithmetic rewrites. For each: apply → run → any failing test is a brittle candidate (record broke=true + broken_tests + the diff) → revert.\n\n`
      : `4. SPECIFICITY: skipped at this level — return an empty noops array.\n\n`) +
    (dial.D > 0
      ? `5. DELAYS — ${dial.D} delay injections: insert a one-line ~100 ms sleep (the language's obvious construct) into a covered production path. ` +
        `For each: apply → run → record broke + broken_tests → revert. A break here is NOT proof of brittleness — it may be a legitimate latency contract; just record it.\n\n`
      : `5. DELAYS: skipped at this level — return an empty delays array.\n\n`) +
    `6. INTEGRITY GATE (see workspace instructions), then return the structured record. ` +
    `audited=true only if the full protocol ran and the integrity gate passed. Every diff you report must be the real applied diff. ` +
    `Report every file field as a REPO-RELATIVE path (e.g. src/parser.py) — never a worktree or absolute path; later verification agents resolve them against ${repoRoot}.`
  )
}

const verifierStage = async (workerResult, comp) => {
  if (!workerResult || !dial.verify || !workerResult.audited) return workerResult
  const survivors = (workerResult.mutants || []).filter(m => m.outcome === 'SURVIVED')
  const brittle = (workerResult.noops || []).filter(n => n.broke)
  if (survivors.length === 0 && brittle.length === 0) return workerResult

  const verdicts = await parallel([
    ...survivors.map(m => () =>
      agent(
        `Adversarial verification in a test-suite audit of ${repoRoot}. Read-only.\n` +
        `A mutant SURVIVED (no test failed). Try to REFUTE the finding by proving the mutant is EQUIVALENT ` +
        `(no observable behavior change) or sits in dead/unreachable code.\n` +
        `File: ${m.file}:${m.line} (repo-relative — resolve it against ${repoRoot}; the worker's workspace no longer exists)\n` +
        `Diff:\n${m.diff}\nWorker's claimed behavior change: ${m.stated_behavior_change}\n\n` +
        `Read the surrounding code. refuted=true ONLY if you can concretely argue equivalence or unreachability (state the argument in reason). ` +
        `If the claimed behavior change is real and observable, refuted=false.`,
        { label: `verify-mutant:${comp.name}`, phase: 'Verify', schema: VERIFY_SCHEMA }
      ).then(v => ({ kind: 'mutant', item: m, v }))),
    ...brittle.map(n => () =>
      agent(
        `Adversarial verification in a test-suite audit of ${repoRoot}. Read-only.\n` +
        `A supposedly behavior-preserving edit BROKE tests (${(n.broken_tests || []).join(', ')}). ` +
        `Try to REFUTE the brittleness finding by proving the edit actually CHANGED behavior (then the tests were right to fail).\n` +
        `File: ${n.file} (repo-relative — resolve it against ${repoRoot})\nDiff:\n${n.diff}\n\n` +
        `refuted=true ONLY if you can concretely show a behavior change (state it in reason); otherwise refuted=false.`,
        { label: `verify-noop:${comp.name}`, phase: 'Verify', schema: VERIFY_SCHEMA }
      ).then(v => ({ kind: 'noop', item: n, v }))),
  ])

  for (const r of verdicts.filter(Boolean)) {
    if (!r.v) {
      // Verify agent died: the finding is NOT verified — keep it, but as a candidate.
      r.item.verify_failed = true
      workerResult.notes = ((workerResult.notes || '') +
        ` [verify: agent failed for ${r.item.file} — finding stays candidate, NOT verify-confirmed]`).trim()
      continue
    }
    if (!r.v.refuted) continue
    if (r.kind === 'mutant') {
      workerResult.mutants = workerResult.mutants.filter(m => m !== r.item)
      workerResult.notes = ((workerResult.notes || '') +
        ` [verify: dropped equivalent mutant ${r.item.file}:${r.item.line} — ${r.v.reason}]`).trim()
    } else {
      r.item.broke = false
      r.item.broken_tests = []
      workerResult.notes = ((workerResult.notes || '') +
        ` [verify: no-op in ${r.item.file} actually changed behavior — brittle candidate dropped — ${r.v.reason}]`).trim()
    }
  }
  const dropped = verdicts.filter(Boolean).filter(x => x.v && x.v.refuted).length
  if (dropped) log(`Verify ${comp.name}: dropped ${dropped} refuted finding(s)`)
  return workerResult
}

// Janitor: after a worker dies or fails its integrity gate, restore the user's
// tree (live-tree mode) or remove its leftover worktree (worktree mode).
function janitor(comp, idx, reason) {
  const wt = `${scratchDir}/wt-${idx}`
  const backupDir = `${scratchDir}/backup-${idx}`
  const task = mode === 'worktree'
    ? `If the worktree ${wt} still exists: run \`git -C ${repoRoot} worktree remove --force ${wt}\` ` +
      `(and \`git -C ${repoRoot} worktree prune\`). If it does not exist, do nothing.`
    : `The worker may have left an edit in the USER'S LIVE TREE at ${repoRoot}. ` +
      `For EVERY file under ${backupDir} (its path relative to ${backupDir} is its repo-relative path): ` +
      `copy it back to ${repoRoot}/<relpath> (cp -p), then confirm with cmp. ` +
      `If ${backupDir} does not exist, do nothing. NEVER use git checkout/restore/stash — copying the backups back is the only permitted restore.`
  return agent(
    `You are the cleanup agent of a test-suite audit. A component worker ${reason}.\n${task}\n` +
    `Then report what you found and did in one short paragraph. Touch nothing else.`,
    { label: `janitor:${comp.name}`, phase: 'Workers', schema: {
        type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } }
  )
}

phase('Workers')
let workerResults
if (parallelWorkers) {
  // Worktree mode: workers fan out; each survivor verifies as soon as its worker lands.
  workerResults = await pipeline(
    components,
    (comp, _orig, idx) => agent(workerPrompt(comp, idx),
      { label: `worker:${comp.name}`, phase: 'Workers', schema: WORKER_SCHEMA }),
    async (res, comp, idx) => {
      if (!res || !res.integrity_ok) {
        const j = await janitor(comp, idx, res ? 'failed its integrity gate' : 'died mid-run')
        if (j) log(`Janitor ${comp.name}: ${j.summary}`)
      }
      return verifierStage(res, comp)
    }
  )
} else {
  // Live-tree (or unprobed-hermeticity) mode: strictly one worker at a time; the
  // tree must be verified restored before the next worker may start.
  workerResults = []
  for (let i = 0; i < components.length; i++) {
    const res = await agent(workerPrompt(components[i], i),
      { label: `worker:${components[i].name}`, phase: 'Workers', schema: WORKER_SCHEMA })
    if (!res || !res.integrity_ok) {
      const j = await janitor(components[i], i, res ? 'failed its integrity gate' : 'died mid-run')
      if (j) log(`Janitor ${components[i].name}: ${j.summary}`)
    }
    workerResults.push(await verifierStage(res, components[i]))
  }
}

const workers = workerResults.filter(Boolean)
const audited = workers.filter(w => w.audited)
log(`Workers: ${audited.length}/${components.length} component(s) fully audited (mode=${mode}${parallelWorkers ? ', parallel' : ', serialized'})`)

// ---------------------------------------------------------------------------
// Phase 5 — Synthesis
// ---------------------------------------------------------------------------

phase('Synthesis')

const notChecked = [
  ...skippedComponents.map(n => `component ${n} — beyond the level=${level} cap`),
  ...components.filter((c, i) => !workerResults[i]).map(c => `component ${c.name} — worker agent failed`),
  ...(baseline.shuffle_flag ? [] : ['test-order shuffle — the runner has no native shuffle flag']),
  ...(dial.verify ? [] : ['equivalent-mutant verification — runs at level=high only; survivors are candidates']),
  ...(dial.hermeticity ? [] : ['hermeticity probe — skipped at level=low; workers were serialized instead']),
  ...(dial.M === 0 ? ['specificity (no-op probes) — skipped at level=low'] : []),
  ...(dial.D === 0 ? ['delay injection — skipped at level=low'] : []),
  ...(baseline.dirty_tree && mode === 'worktree' ? ['uncommitted working-tree changes — worktree mode audits HEAD'] : []),
]

const report = await agent(
  `Assemble the final test-suite strength report for ${repoRoot}. Be adversarial and honest; a strong verdict must be earned.\n\n` +
  `AUDIT SETUP: level=${level}, mode=${mode}${parallelWorkers ? '' : ' (serialized)'}, dials K=${dial.K} M=${dial.M} D=${dial.D} R=${dial.R}.\n` +
  `${hermeticityNote ? 'HERMETICITY: ' + hermeticityNote + '\n' : ''}` +
  `BASELINE (measured): ${JSON.stringify({ test_cmd: baseline.test_cmd, wall_s: baseline.wall_s, coverage_pct: baseline.coverage.pct, shuffle_flag: baseline.shuffle_flag, dirty_tree: baseline.dirty_tree, slow_tests: baseline.slow_tests }, null, 2)}\n\n` +
  `PER-COMPONENT WORKER RECORDS${dial.verify ? ' (survivors already adversarially verified; refuted findings dropped, see notes)' : ''}:\n${JSON.stringify(workers, null, 2)}\n\n` +
  `NOT-CHECKED LIST (include verbatim, plus anything you notice is missing):\n${JSON.stringify(notChecked, null, 2)}\n\n` +
  `Build the report:\n` +
  `1. scores: kill_rate = killed / total mutants across AUDITED components; brittle_breaks = no-ops that broke tests; flaky_tests = distinct flaky tests; timing_sensitive = distinct tests broken by delay injection; suite_wall_s = baseline wall.\n` +
  `2. findings: one per proven weakness. axis: sensitivity (survived mutant), specificity (brittle break), reliability (flake), timing (test broken by delay injection), speed (slow suite/tests), auditability. ` +
  `Each carries the concrete evidence (the diff or run-log excerpt), an implication stating what broken behavior would ship undetected or what the weakness costs, and candidate: ` +
  `${dial.verify
    ? 'false for verify-confirmed survivors and brittle breaks — EXCEPT items flagged verify_failed=true (their verify agent failed), which stay candidate=true; '
    : 'true for ALL survivors and brittle breaks (no verify pass ran); '}` +
  `delay-injection findings are ALWAYS candidate=true (a latency contract may be legitimate). Dedupe: the same weakness surfaced twice is ONE finding with the strongest evidence.\n` +
  `Severity rubric: blocker = a core behavior could be fully inverted/removed undetected or a test is proven vacuous; major = a meaningful branch, bound, or computation is unpinned, or a proven flake/brittle break; minor = a narrow edge case or an inefficiency. ` +
  `Timing findings: major when multiple tests share the timing dependence, minor for an isolated test.\n` +
  `3. proposals: concrete next actions — "add a test that kills this survivor in <file>:<line> (assert <behavior>)", "quarantine flaky test X", "split/exclude slow test Y". Each tied to its finding. No code, just the actions.\n` +
  `4. components table: per component kill_rate, flakes, brittle, slice_wall_s, audited.\n` +
  `5. checked: one compact prose line — components audited, mutants applied, no-ops, delays, reruns, coverage pct, mode.\n` +
  `6. verdict: untrustworthy = baseline flaky enough to distrust results; strong = kill_rate >= 0.75 across audited components AND zero flakes AND zero brittle breaks AND suite < ~120 s — must be EARNED; weak = kill_rate low or vacuous tests proven; else adequate. ` +
  `Headline must not claim strength unless the verdict is strong.`,
  { label: 'synthesis', phase: 'Synthesis', schema: REPORT_SCHEMA, effort: 'high' }
)

return {
  repoRoot,
  level,
  mode,
  parallel_workers: parallelWorkers,
  report,
  scratchDir,
  raw: {
    baseline: {
      test_cmd: baseline.test_cmd, wall_s: baseline.wall_s,
      coverage: baseline.coverage, shuffle_flag: baseline.shuffle_flag,
      worktree_ok: baseline.worktree_ok, dirty_tree: baseline.dirty_tree,
    },
    components: grouping.components,
    workers,
    not_checked: notChecked,
    hermeticity_note: hermeticityNote,
  },
}
