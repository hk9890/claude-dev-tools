export const meta = {
  name: 'test-tests',
  description: 'Empirical test-suite strength audit: baseline → grouping → coverage-truth and isolation probes → per-component mutation/reachability/no-op/rerun/delay probes → verify → synthesis',
  whenToUse: 'Launched by the /project-auto-work:test-tests skill. Proves whether a test suite detects bugs (mutation kill rate), stays quiet on non-bugs, is flake-free, runs fast, and whether its unit tests are really isolated. It measures for itself which lines the tests execute, so a coverage report is an optional input, never a prerequisite. Reports and proposes; never keeps an edit.',
  phases: [
    { title: 'Baseline', detail: 'test command, clean run, optional coverage, unit split, workspace probe' },
    { title: 'Grouping', detail: 'components: prod slice + tests + selector + churn' },
    { title: 'Hermeticity', detail: 'same slice twice in parallel — safe to parallelize?' },
    { title: 'Probes', detail: 'coverage-truth mutants (only where the repo has a coverage command) + unit-isolation denial run' },
    { title: 'Workers', detail: 'per component: reruns, mutants, reachability probes, no-ops, delays, integrity' },
    { title: 'Verify', detail: 'refute survivors as equivalent mutants (level=high|ultra only)' },
    { title: 'Synthesis', detail: 'scores, verdict, findings, proposals, checked/not-checked' },
  ],
}

// args: { repoRoot, scriptsDir, level?, scratchDir? }

// ---------------------------------------------------------------------------
// Pure helpers — no runtime globals, so the abort gates, dials and scoreability
// guard are reachable without launching a multi-agent run (each of which mutates
// production code). Unit-tested via
// tests/project-auto-work/script-tests/test-test-tests.js.
// ---------------------------------------------------------------------------

// The depth vocabulary is shared with project-review-codebase and project-review-docs:
// one argument name, one token set, so a token learned at one skill means the same
// thing at the next.
const LEVELS = ['low', 'medium', 'high', 'ultra']

// Dials per level (design §8). Verify pass only at the deepest rung; one rerun uses the
// runner's shuffle flag at every level when the baseline discovered one.
// T and `denial` are the two audit-wide probes: T mutants test whether the repo's coverage
// command tells the truth, and `denial` runs the declared unit slice with its external
// environment denied. Both are per AUDIT, not per component — "does the coverage command
// under-report" and "are the unit tests isolated" are properties of the repository, and
// paying for them per component would multiply the suite's own runtime for one answer.
// T is spent only where the repository HAS a coverage command; without one there is no
// claim to check, and the audit's own reachability probes cover the same ground per site.
// The reachability probe itself takes no dial: it runs once per SURVIVING mutant at every
// level, because a survivor nobody can interpret is not a measurement.
const DIALS = {
  low:    { components: 3,  K: 3, M: 0, D: 0, R: 2, T: 0, denial: false, hermeticity: false, verify: false },
  medium: { components: 8,  K: 5, M: 2, D: 1, R: 3, T: 3, denial: true,  hermeticity: true,  verify: false },
  high:   { components: 12, K: 8, M: 3, D: 2, R: 5, T: 5, denial: true,  hermeticity: true,  verify: true },
}

// `ultra` belongs to the shared vocabulary, but this audit's deepest dials are `high`'s:
// its cost is dominated by the suite's own runtime, not by a refutation pass, so ultra
// runs the high dials rather than inventing a rung with no extra measurement behind it.
const LEVEL_DIALS = { low: 'low', medium: 'medium', high: 'high', ultra: 'high' }

function dialFor(level) {
  return DIALS[LEVEL_DIALS[level] || 'medium']
}

// Finding-shaped worker output that stops the audit taking on further components. The dials
// already bound effort; this bounds *output*, so a suite weak enough to survive most of its
// mutants does not return a report too long to act on in one pass. Components never started
// land in not_checked, and the headline says the audit was capped — kill_rate is then a rate
// over the components that DID run, which is only honest if the reader is told.
const FINDINGS_CAP = 20

// A proxy for "how many findings will synthesis draw from this worker": surviving mutants,
// flaky tests, and no-ops that broke a test. Counted after the verify stage, so survivors
// an adversarial pass already refuted are not counted toward the cap.
function findingSignals(workerResult) {
  if (!workerResult) return 0
  const survivors = (workerResult.mutants || []).filter(m => m && m.outcome === 'SURVIVED').length
  const flakes = (workerResult.flakes || []).length
  const brittle = (workerResult.noops || []).filter(n => n && n.broke).length
  return survivors + flakes + brittle
}

// Normalize the incoming `args` value into the audit's configuration, and reject an
// unusable one before anything mutates a file.
// Defensive: the runtime may hand `args` over as a JSON *string* rather than a parsed
// object (observed in practice). A string has no `.repoRoot`, so reading it directly
// would leave every field undefined.
function normalizeArgs(rawArgs) {
  let parsed = rawArgs
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = {} }
  }
  parsed = parsed || {}

  const repoRoot = String(parsed.repoRoot || '')
  const scriptsDir = String(parsed.scriptsDir || '')
  const raw = String(parsed.level || '').toLowerCase()
  const level = LEVELS.includes(raw) ? raw : 'medium'

  // SKILL.md mints this per run with mktemp; worktree and backup paths below are indexed,
  // not unique, so the bare default is safe for one run at a time only.
  // Require absolute. This value is interpolated into `git worktree add` and
  // `git worktree remove --force`, and workers `mkdir -p` it — a relative value (an
  // unsubstituted "<SCRATCH>" placeholder is truthy and slips past a falsy check) would
  // put all of that inside the repository under audit.
  const scratchDir = String(parsed.scratchDir || '/tmp/test-tests-scratch')

  let error = null
  if (!repoRoot || !scriptsDir) {
    error = 'missing required args: repoRoot and scriptsDir must both be set'
  } else if (!repoRoot.startsWith('/')) {
    // An unsubstituted "<…>" placeholder from the SKILL.md args template is a non-empty
    // string, so a truthiness check passes it through — and this workflow interpolates
    // repoRoot into `git -C <root> worktree add`, then mutates production files under it.
    error = `repoRoot must be an absolute path (got ${JSON.stringify(repoRoot)}) — worktrees are created off it and production files are mutated under it`
  } else if (!scriptsDir.startsWith('/')) {
    error = `scriptsDir must be an absolute path (got ${JSON.stringify(scriptsDir)}) — it is interpolated into the coverage validator command`
  } else if (!scratchDir.startsWith('/')) {
    error = `scratchDir must be an absolute path (got ${JSON.stringify(scratchDir)}) — worktrees and backups are created there, outside the repo`
  }

  return {
    repoRoot,
    scriptsDir,
    level,
    dial: dialFor(level),
    scratchDir,
    // Echoed on a bail-out: the error names the two expected keys, so without the keys
    // that actually arrived a caller who sent `scripts_dir` cannot tell which one is wrong.
    receivedKeys: Object.keys(parsed),
    validateTool: `python3 "${scriptsDir}/validate-coverage-summary.py"`,
    // Trailing slash tolerated, matching review-docs.js's sibling-path resolution: without
    // it a scriptsDir ending in "/" yields a doubled separator in the schema path.
    schemaRef: `${scriptsDir.replace(/\/scripts\/?$/, '')}/references/coverage-summary-schema.md`,
    error,
  }
}

// Which abort gate the measured baseline trips, or null to proceed. ORDER MATTERS: a
// timed-out baseline reports green=false too, so the speed gate must be evaluated before
// the red gate or every slow suite would be reported as a failing one.
function baselineAbort(baseline) {
  if (baseline.wall_s > 600) {
    return {
      reason: 'suite too slow to audit — the baseline run did not finish within the 600 s cap',
      evidence:
        `Command: ${baseline.test_cmd}\nBaseline run: killed by timeout (> 600 s), so its pass/fail state is unknown\n` +
        `Filter syntax: ${baseline.filter_syntax || 'none found'} (can_slice=${baseline.can_slice})\n` +
        `Slowest tests (from baseline timing data): ${baseline.slow_tests || 'not captured'}`,
      remediation: 'Speed the suite up, or scope the audit to a subdirectory with its own faster suite; the slowest tests in the evidence are the first candidates to exclude from the audited command.',
    }
  }
  if (!baseline.green) {
    return {
      reason: 'suite is red at baseline — unauditable',
      evidence: `Command: ${baseline.test_cmd}\nFailures:\n${baseline.red_details || '(none captured)'}`,
      remediation: 'Fix or quarantine the failing tests so the suite is green, then re-run the audit. Name each failing test and the quarantine/skip mechanism this runner supports.',
    }
  }
  // Coverage is deliberately NOT a gate. The audit measures reachability itself, one throw
  // probe per surviving mutant, so a repo with no coverage command is fully auditable — it
  // only loses the site-ranking hint and the coverage-truth probe, and both absences are
  // reported rather than hidden.
  return null
}

// Reachability as the workers measured it. A KILLED mutant proves its line executes; a
// SURVIVED one is followed by a throw probe at the same site, and only that settles whether
// the survivor is a blind assertion or code no test runs at all. Pure so the ratio the
// verdict cap keys on is testable without an audit run.
function reachabilitySummary(workers) {
  const mutants = (workers || []).filter(w => w && w.audited).flatMap(w => w.mutants || [])
  const unreached = mutants.filter(m => m && m.reached === 'no').length
  const inconclusive = mutants.filter(m => m && m.reached === 'inconclusive').length
  // `sites`, not `probed`: it counts every mutation site at an audited component, killed
  // mutants included. Only survivors earn a throw probe, so "probed" would read as the
  // smaller number and make the cap's share look larger than it is.
  return { sites: mutants.length, unreached, inconclusive, reached: mutants.length - unreached - inconclusive }
}

// kill_rate excludes sites no test reaches, so a suite that executes almost nothing can post
// a perfect rate over a handful of sites. Past this share of all mutation sites the top
// verdict is off the table and the headline has to say why.
const UNREACHED_CAP_RATIO = 1 / 3

// Guard the score's denominator, not just the component count. kill_rate is killed over
// total mutants across AUDITED components; that is 0/0 whenever no audited component
// carries a mutant, which includes a worker reporting audited=true with an empty mutants
// array. Synthesis would still be asked for a verdict and the schema permits any of them,
// so a confident one could be reported on no evidence. The other three axes can carry
// findings even with no scoreable mutant and are real measurements, so only the case where
// EVERY axis is empty aborts. Returns null when there is something to score.
function scoreabilityAbort(workers) {
  const audited = workers.filter(w => w && w.audited)
  const mutants = audited.reduce((n, w) => n + ((w.mutants && w.mutants.length) || 0), 0)
  const otherAxis = audited.reduce((n, w) => n +
    ((w.flakes && w.flakes.length) || 0) +
    ((w.noops && w.noops.length) || 0) +
    ((w.delays && w.delays.length) || 0), 0)
  if (mutants > 0 || otherAxis > 0) return null

  // Two distinct ways to get here, and only one of them means nobody finished:
  //  - no worker completed the protocol at all; or
  //  - workers completed but hold no mutant — at the deepest level the verify stage
  //    removes refuted equivalent mutants, so a component whose mutants were all refuted
  //    ends audited with an empty array.
  // Name whichever actually happened; a fixed string would be false in the second case.
  const reason = audited.length === 0
    ? 'no component completed the protocol, so nothing was measured'
    : 'every audited component finished with no scoreable mutant and no finding on any other axis'
  // One line per worker, not just the incomplete ones: with audited-but-empty workers a
  // filter on !audited yields an empty block while the counts above say otherwise.
  const perWorker = workers
    .map(w => w.audited
      ? `  ${w.component}: audited, 0 mutants${w.notes ? ` — ${w.notes}` : ''}`
      : `  ${w.component}: not audited — ${w.not_audited_reason || 'no reason reported'}`)
    .join('\n')
  return { reason, perWorker, auditedCount: audited.length }
}

// Everything the audit did NOT measure, so the report can say so out loud instead of
// letting a capped or skipped axis read as a clean one.
function notCheckedList({ level, dial, baseline, components, workerResults, skippedComponents, cappedComponents, mode, probes }) {
  const capped = new Set(cappedComponents || [])
  return [
    ...skippedComponents.map(n => `component ${n} — beyond the level=${level} cap`),
    ...[...capped].map(n => `component ${n} — never audited: the run had already reached ${FINDINGS_CAP} findings`),
    ...components.filter((c, i) => !workerResults[i] && !capped.has(c.name)).map(c => `component ${c.name} — worker agent failed`),
    ...(baseline.shuffle_flag ? [] : ['test-order shuffle — the runner has no native shuffle flag']),
    ...(dial.verify ? [] : ['equivalent-mutant verification — runs at level=high and level=ultra only; survivors are candidates']),
    ...(dial.hermeticity ? [] : ['hermeticity probe — skipped at level=low; workers were serialized instead']),
    ...(dial.M === 0 ? ['specificity (no-op probes) — skipped at level=low'] : []),
    ...(dial.D === 0 ? ['delay injection — skipped at level=low'] : []),
    ...(dial.T === 0 ? ['coverage-truth probe — skipped at level=low; any coverage report the repo has was taken on trust'] : []),
    // An absent coverage report costs the audit a site-ranking hint and the coverage-truth
    // probe, nothing more — but a reader who is not told will assume both happened.
    // The condition must match the orchestration's `coverageOn` exactly: obtained=true with
    // no summary_file leaves nothing to read, so the audit skips both and this must say so.
    ...(baseline.coverage && baseline.coverage.obtained && baseline.coverage.summary_file
      ? []
      : ['repository coverage report — no mutation site was ranked by one and no untested_churn was derived; reachability was measured per site instead']),
    ...(dial.denial ? [] : ['unit-isolation denial probe — skipped at level=low']),
    // A probe that was budgeted but could not run says so with its own reason: a missing
    // measurement must not read as a passing one.
    ...(probes && probes.truth_skipped ? [`coverage-truth probe — ${probes.truth_skipped}`] : []),
    ...(probes && probes.denial_skipped ? [`unit-isolation denial probe — ${probes.denial_skipped}`] : []),
    ...(baseline.dirty_tree && mode === 'worktree' ? ['uncommitted working-tree changes — worktree mode audits HEAD'] : []),
  ]
}

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
    // OPTIONAL. obtained=false is a normal outcome: it costs the audit the site-ranking
    // hint and the coverage-truth probe, and nothing else. The audit proves reachability
    // for itself, per site, with a throw probe.
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
    // The repository's own declaration of which tests are unit tests, discovered the same
    // way as the test command. The denial probe runs against unit_selector; deny_recipe is
    // how this repo's external dependencies are taken away.
    // external_env is what makes the probe honest: it lists the environment variables the
    // PRODUCTION CODE actually reads that name an external dependency. A repo whose code
    // reads none has nothing to deny, and a denied run there would pass while proving
    // nothing — so the probe reports that it did not run rather than returning a clean
    // isolation result. Verified against two real repos where exactly this happens.
    unit_split: {
      type: 'object',
      properties: {
        declared: { type: 'boolean' },
        unit_selector: { type: 'string' },
        external_env: { type: 'array', items: { type: 'string' } },
        deny_recipe: { type: 'string' },
        source: { type: 'string' },
        why_not: { type: 'string' },
      },
      required: ['declared'],
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
  required: ['test_cmd', 'green', 'wall_s', 'coverage', 'unit_split', 'can_slice', 'worktree_ok', 'dirty_tree'],
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
    // Uncovered code in the most-churned production files, taken from the REPOSITORY'S OWN
    // coverage report. Derived, not probed: both inputs are already on disk, so this costs
    // no suite run — and it is churn-ranked, never risk-ranked, which is why it carries no
    // severity downstream. Empty when the repo exposes no coverage command; the audit's own
    // proven-unreached sites are the measured counterpart, and those do carry findings.
    untested_churn: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          uncovered_ranges: { type: 'string' },
          uncovered_lines: { type: 'integer' },
          churn_commits: { type: 'integer' },
        },
        required: ['path', 'uncovered_ranges'],
      },
    },
    rationale: { type: 'string' },
  },
  required: ['components', 'untested_churn'],
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

// The coverage-truth probe mutates lines the coverage summary calls UNCOVERED. Only one of
// its two outcomes carries information: a KILLED mutant proves the coverage command
// under-reports, and every mutation site in the whole audit was drawn from that data. A
// SURVIVED mutant restates what the coverage summary already said, so it is discarded.
const COVERAGE_TRUTH_SCHEMA = {
  type: 'object',
  properties: {
    ran: { type: 'boolean' },
    skipped_reason: { type: 'string' },
    mutants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          diff: { type: 'string' },
          why_suspected: { type: 'string' },
          outcome: { type: 'string', enum: ['KILLED', 'SURVIVED'] },
          killed_by: { type: 'string' },
        },
        required: ['file', 'line', 'diff', 'why_suspected', 'outcome'],
      },
    },
    integrity_ok: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['ran', 'integrity_ok'],
}

// The denial probe runs the repo's declared unit slice with its external environment taken
// away. A test that fails only because the environment is gone is an integration test
// wearing a unit-test label.
const DENIAL_SCHEMA = {
  type: 'object',
  properties: {
    ran: { type: 'boolean' },
    skipped_reason: { type: 'string' },
    unit_selector: { type: 'string' },
    deny_recipe: { type: 'string' },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          test: { type: 'string' },
          error: { type: 'string' },
          resource: { type: 'string' },
        },
        required: ['test', 'error'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['ran'],
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
          // Recorded so the report can tell a thorough mutant mix from a lazy one, and so
          // the boundary rule in the worker prompt is checkable after the fact.
          operator: {
            type: 'string',
            enum: ['negate-condition', 'flip-comparison', 'boundary-constant', 'delete-guard',
              'swap-args', 'replace-constant', 'logic-operator', 'delete-statement', 'return-constant'],
          },
          stated_behavior_change: { type: 'string' },
          outcome: { type: 'string', enum: ['KILLED', 'SURVIVED'] },
          killed_by: { type: 'string' },
          implication: { type: 'string' },
          // What replaces the coverage report, measured per site instead of trusted. A KILLED
          // mutant carries 'yes' for free — a test failed on it, so the line ran. A SURVIVED
          // one earns its value from a throw probe at the same site: 'yes' makes it a blind
          // assertion, 'no' makes it untested code, 'inconclusive' means the probe could not
          // decide (the throw broke the build, or a broad catch could have swallowed it).
          reached: { type: 'string', enum: ['yes', 'no', 'inconclusive'] },
          reach_evidence: { type: 'string' },
        },
        required: ['file', 'line', 'diff', 'operator', 'stated_behavior_change', 'outcome', 'reached'],
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
        coverage_truth_kills: { type: 'integer' },
        unreached_sites: { type: 'integer' },
        mislabelled_unit_tests: { type: 'integer' },
        suite_wall_s: { type: 'number' },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          axis: { type: 'string', enum: ['sensitivity', 'specificity', 'reliability', 'timing', 'speed', 'isolation', 'auditability'] },
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
          // Settled or open — the vocabulary is defined once in references/decision-split.md.
          decision: { type: 'string', enum: ['settled', 'open'] },
          // The three below are what an open decision needs to be answerable by someone who
          // did not watch the audit. Required in practice when decision is 'open' — JSON
          // Schema cannot express that conditional, so the synthesis prompt states it.
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          recommendation: { type: 'string' },
        },
        required: ['action', 'rationale', 'decision'],
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
    // Derived from the REPOSITORY'S OWN coverage report and git churn, never probed — so it
    // is a section of the report, not a finding: in a report where every finding is backed
    // by a probe that ran, a severity here would break that contract. Empty when the repo
    // exposes no coverage command.
    untested_churn: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          uncovered_ranges: { type: 'string' },
          uncovered_lines: { type: 'integer' },
          churn_commits: { type: 'integer' },
        },
        required: ['path', 'uncovered_ranges'],
      },
    },
    checked: { type: 'string' },
    not_checked: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'headline', 'findings', 'proposals', 'checked', 'not_checked'],
}

// Expose the pure helpers to any module loader (the Node unit tests in
// tests/project-auto-work/script-tests use this). Assigned before the orchestration below
// so it is reached whichever path that takes.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeArgs, dialFor, baselineAbort, scoreabilityAbort, notCheckedList, findingSignals, reachabilitySummary, LEVELS, DIALS, FINDINGS_CAP, UNREACHED_CAP_RATIO }
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
    log(`test-tests: ${cfg.error} (args arrived as type "${typeof args}", keys: ${cfg.receivedKeys.join(', ') || 'none'})`)
    return { error: cfg.error, got: { type: typeof args, keys: cfg.receivedKeys, repoRoot: cfg.repoRoot } }
  }

  const { repoRoot, level, dial, scratchDir, validateTool, schemaRef } = cfg

  // ── Abort helper — every abort IS a report (remediation proposals filled in).

  const abortReport = async (reason, evidence, remediationHint) => {
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
      `(e.g. the failing test to quarantine, the slow tests to exclude from the audited command), ` +
      `with decision "settled" (the audit cannot happen until it is done, so there is nothing to weigh). ` +
      `checked describes the little that WAS done; not_checked lists every audit axis that never ran.`,
      { label: 'abort-report', phase: 'Synthesis', schema: REPORT_SCHEMA }
    )
    return { repoRoot, level, aborted: true, abort_reason: reason, report, scratchDir }
  }

  // ── Phase 1 — Discovery, baseline, coverage, workspace probe

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
    `If it is RED, capture the failing tests' names and output excerpt in red_details, set green=false, and still attempt steps 4-7 cheaply if possible; accuracy of red_details matters most.\n` +
    `Also capture per-test timings if the runner offers them cheaply (a timing/durations flag or reporter it already has); summarize the slowest tests in slow_tests. ` +
    `If the runner offers no per-test timing output, record that fact in slow_tests and MOVE ON — do not dig for it.\n\n` +
    `3. COVERAGE — OPTIONAL, and a short search. The audit measures for itself which lines the tests execute, so a repo with no coverage report is fully auditable; ` +
    `what a report buys is a ranking hint for mutation sites and a claim the audit can then check. It never gates the run, and this audit does NOT parse coverage formats.\n` +
    `DISCOVER, the same way you found the test command and only from the project's OWN docs (testing/contributor/agent docs, README, task files), a command that emits a coverage summary as JSON on stdout ` +
    `in the neutral schema documented at ${schemaRef} (a "files" array of {repo-relative path, covered_ranges, uncovered_ranges}). ` +
    `Record it in producer_cmd and where you found it in producer_source. Do not invent one the repo does not document, never install anything, and do not go hunting: if the documented sources do not name one, that is the answer.\n` +
    `Where one exists, run it (wrapped in \`timeout 590\`), capture stdout to ${scratchDir}/coverage_raw.json, then validate + normalize:\n` +
    `   ${validateTool} ${scratchDir}/coverage_raw.json --repo-root ${repoRoot} > ${scratchDir}/coverage_summary.json\n` +
    `CONTRACT: obtained=true is valid ONLY if the validator exits 0 AND ${scratchDir}/coverage_summary.json exists — then fill summary_file and pct (the summary's totals.pct).\n` +
    `If the repo documents NO such command, set obtained=false and put into how_to_enable exactly what to add (a command emitting the schema at ${schemaRef}, and where to document it). The audit continues without it.\n` +
    `If a command exists but the validator REJECTS its output (exit 3), set obtained=false, record the command in producer_cmd, and put the validator's stderr verbatim into validation_errors. The audit continues without it.\n\n` +
    `4. RUNNER FEATURES: record the runner's native order-shuffle flag if one exists (only a flag/plugin that is ALREADY available — never install one) ` +
    `in shuffle_flag, and the test-filter syntax (however this runner selects a subset — a path, a name filter, a package pattern) in filter_syntax. ` +
    `Set can_slice=true only after PROVING it by actually running one small subset.\n\n` +
    `5. UNIT/INTEGRATION SPLIT: discover whether this repo DECLARES which of its tests are unit tests, from the same kind of sources as the test command — ` +
    `testing/contributor docs, task files, CI workflows, runner markers or tags, a test-directory convention the docs actually state. ` +
    `If it does: set declared=true, put the exact selector that runs ONLY the unit tests in unit_selector, and record where the declaration lives in source.\n` +
    `Then find what there is to deny. Grep the PRODUCTION code for the environment variables it reads (the language's env accessor — \`os.Getenv\`, \`process.env\`, \`ENV[\`, \`getenv\`), and keep only those naming an EXTERNAL dependency: a host, URL, port, DSN, endpoint, or credential. ` +
    `List them in external_env. Variables like PATH, HOME, USER, LANG or a debug flag are not external dependencies — leave them out.\n` +
    `Build deny_recipe from that list and nothing else: point each variable at something unroutable, or unset it (e.g. \`DATABASE_URL=postgres://127.0.0.1:1 REDIS_URL=redis://127.0.0.1:1 <selector>\`). ` +
    `Environment is the whole mechanism here: it is what makes the probe work the same on any operating system, with no privileges and nothing installed.\n` +
    `WHEN external_env IS EMPTY, leave deny_recipe empty too. That is a real and common answer — a repo whose code reaches the outside world through hardcoded hosts or in-process fakes has nothing an environment can take away — and the audit reports the probe as not run. ` +
    `A recipe naming variables the code never reads would run green while denying nothing, and that reads as proof of isolation when none was obtained.\n` +
    `If the repo declares no split, set declared=false and record in why_not what is missing — a split inferred from file names alone is a guess, and the audit reports the absent declaration instead.\n\n` +
    `6. WORKSPACE PROBE: create a throwaway worktree and check the suite runs there:\n` +
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
    `7. Record dirty_tree = whether \`git -C ${repoRoot} status --porcelain\` is non-empty.\n\n` +
    `Return the structured baseline object. Be precise: every number measured, not estimated.`,
    { label: 'baseline', phase: 'Baseline', schema: BASELINE_SCHEMA }
  )

  if (!baseline) return { error: 'baseline agent failed', repoRoot, level }

  // The repo's coverage report, where it has one, is an input this audit ranks sites with
  // and then checks — never one it depends on. Everything downstream branches on this flag.
  const coverageOn = !!(baseline.coverage && baseline.coverage.obtained && baseline.coverage.summary_file)

  log(`Baseline: cmd="${baseline.test_cmd}" green=${baseline.green} wall=${baseline.wall_s}s ` +
      `coverage=${coverageOn ? ((baseline.coverage.pct != null ? baseline.coverage.pct : '?') + '%') : 'none (optional — reachability is measured per site)'} ` +
      `worktree_ok=${baseline.worktree_ok} can_slice=${baseline.can_slice}`)

  const gate = baselineAbort(baseline)
  if (gate) return await abortReport(gate.reason, gate.evidence, gate.remediation)

  // ── Phase 2 — Grouping into components

  phase('Grouping')

  const grouping = await agent(
    `You are the grouping agent of a test-suite strength audit of ${repoRoot}. Read-only: do not modify anything.\n\n` +
    `Baseline facts (measured, do not re-derive): test command \`${baseline.test_cmd}\`, full-suite wall ${baseline.wall_s}s, ` +
    `filter syntax: ${baseline.filter_syntax || 'unknown'}, slowest tests: ${baseline.slow_tests || 'n/a'}.\n` +
    (coverageOn
      ? `Per-file coverage summary — the REPOSITORY'S OWN claim, an optional input this audit does not trust and will check: read ${scratchDir}/coverage_summary.json (already normalized).\n\n`
      : `This repo exposes no conforming coverage command, which is fine: the audit measures reachability itself, one probe per site. Group from the code and the tests alone.\n\n`) +
    `Partition the codebase into COMPONENTS: a component is a cohesive production-code slice plus the tests that exercise it, ` +
    `derived from directory structure, naming conventions${coverageOn ? ', and the coverage summary' : ''}. Do NOT rely on per-test coverage (not portable).\n` +
    `Rules:\n` +
    `- SMALL-REPO RULE (check this FIRST): if the suite runs in under ~60 s AND has fewer than ~20 test files, return exactly ONE component covering the whole suite ` +
    `(test_selector = the full command, churn_rank = 1 — skip the churn computation entirely). ` +
    `A fast suite with MANY test files still gets split into components: selectors are cheap to validate, and more components mean more mutation sites audited.\n` +
    `- Aim for 3-10 components.\n` +
    `- test_selector: the exact shell command that runs only that component's tests, built from the documented filter syntax. ` +
    `It MUST be portable: executed with the repo root (or a fresh worktree of it) as the working directory — so use repo-relative paths only, ` +
    `never absolute paths and never a leading \`cd\`. It will be validated before use.\n` +
    `- est_runtime_s: your estimate of the selector's wall time (from baseline timings where possible).\n` +
    (coverageOn
      ? `- coverage_pct: the component's aggregate line coverage computed from the per-file summary entries of its prod_paths — ` +
        `never totals.pct (the totals may include test helpers/fixtures and would skew the figure). It is the repo's claim, not a measurement of this audit's.\n`
      : `- coverage_pct: omit it. There is no coverage summary, and a figure guessed from file names would be read as measured.\n`) +
    `- churn_rank: 1 = most-churned. Compute from \`git -C ${repoRoot} log --since="6 months ago" --name-only --pretty=format:\` file-change counts aggregated per component.\n\n` +
    (coverageOn
      ? `ALSO PRODUCE untested_churn: up to 10 production files that carry uncovered lines, each with its uncovered_ranges from the summary, uncovered_lines (the total those ranges span), and churn_commits. ` +
        `Both inputs are already in your hands — the per-file coverage summary and the churn counts you just computed — so this is a join, not new work.\n` +
        `ORDER BY churn_commits × uncovered_lines, largest first. Ordering on churn alone puts a hot file with ONE uncovered line above a rarely-touched file with five hundred, and the top of a ten-item list is the part anyone reads. ` +
        `The product keeps a file that changes constantly ahead of a dormant one while still ranking by how much is actually untested.\n` +
        `Report it as exactly what it is: the REPOSITORY'S OWN coverage claim, CHURN-WEIGHTED, never risk-ranked, and unverified by this audit. How often a file changes and how much of it is untested are both counts; neither says how dangerous the gap is, and the report labels it that way. ` +
        `Empty array when every file carrying churn is fully covered.\n\n`
      : `untested_churn: return an EMPTY array. It is a join over a coverage summary, and there is none — a list of files you believe are untested would be a guess, and this audit reports only what it measured. The workers prove per site which lines no test reaches.\n\n`) +
    `Return the components list ordered by churn_rank (most-churned first), untested_churn, plus a short rationale.`,
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

  // ── Phase 2b — Hermeticity probe (worktree mode only)

  const mode = baseline.worktree_ok ? 'worktree' : 'live-tree'
  // Parallel workers require positive hermeticity evidence; the probe only runs at
  // medium and above, so low serializes even in worktree mode (safe over fast).
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

  // ── Workspace protocol — shared by the component workers and the coverage-truth probe.
  // Both mutate production code, so both owe the same backup/revert discipline; the index
  // keeps their worktrees and backup dirs from colliding. failFields names the fields the
  // caller's own schema uses to report an unrecoverable workspace, so each agent disables
  // itself in its own vocabulary.
  const workspaceProtocol = (idx, failFields = 'integrity_ok=false and audited=false') => {
    const wt = `${scratchDir}/wt-${idx}`
    const backupDir = `${scratchDir}/backup-${idx}`
    return mode === 'worktree'
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
        `If any cmp fails, restore from the backup again, and if it still fails set ${failFields} with the reason.`
  }

  // Janitor: after a mutating agent dies or fails its integrity gate, restore the user's
  // tree (live-tree mode) or remove its leftover worktree (worktree mode). Every agent that
  // applies an edit gets one — the coverage-truth probe as much as a component worker.
  const janitor = (name, idx, reason, phaseName = 'Workers') => {
    const wt = `${scratchDir}/wt-${idx}`
    const backupDir = `${scratchDir}/backup-${idx}`
    const task = mode === 'worktree'
      ? `If the worktree ${wt} still exists: run \`git -C ${repoRoot} worktree remove --force ${wt}\` ` +
        `(and \`git -C ${repoRoot} worktree prune\`). If it does not exist, do nothing.`
      : `The agent may have left an edit in the USER'S LIVE TREE at ${repoRoot}. ` +
        `For EVERY file under ${backupDir} (its path relative to ${backupDir} is its repo-relative path): ` +
        `copy it back to ${repoRoot}/<relpath> (cp -p), then confirm with cmp. ` +
        `If ${backupDir} does not exist, do nothing. NEVER use git checkout/restore/stash — copying the backups back is the only permitted restore.`
    return agent(
      `You are the cleanup agent of a test-suite audit. The mutating agent "${name}" ${reason}.\n${task}\n` +
      `Then report what you found and did in one short paragraph. Touch nothing else.`,
      { label: `janitor:${name}`, phase: phaseName, schema: {
          type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } }
    )
  }

  // ── Phase 3 — Audit-wide probes: does the coverage report tell the truth, and are the
  // unit tests actually isolated? Both are properties of the REPOSITORY rather than of any
  // one component, so each runs once for the whole audit. They run sequentially, before the
  // workers: each one runs the suite, and two suite runs at once in live-tree mode would
  // contend for the same files.

  let coverageTruth = null
  let denial = null

  if (dial.T > 0 || dial.denial) {
    phase('Probes')
  }

  if (dial.T > 0 && !coverageOn) {
    // The probe exists to catch a coverage command that under-reports; this repo exposes
    // none, so there is no claim to check. The per-site reachability probes settle the same
    // question where it actually bites, and this is a skip with a reason, not a silent gap.
    coverageTruth = {
      ran: false,
      integrity_ok: true,
      skipped_reason: 'the repository exposes no conforming coverage-summary command, so there is no coverage claim to check',
    }
    log(`Coverage-truth probe: skipped — ${coverageTruth.skipped_reason}`)
  } else if (dial.T > 0) {
    coverageTruth = await agent(
      `You are the coverage-truth probe of a test-suite audit of ${repoRoot}.\n` +
      `This repo has a coverage command, and the audit used it to RANK its mutation sites. Your job is to find out whether that command LIES.\n\n` +
      `${workspaceProtocol('truth', 'integrity_ok=false and ran=false')}\n\n` +
      `Coverage summary (normalized): read ${scratchDir}/coverage_summary.json. Its uncovered_ranges are your targets — the lines the summary claims no test runs.\n` +
      `Full test command: ${baseline.test_cmd} (this is "your selector" in the workspace protocol above).\n` +
      `Components and their production paths: ${JSON.stringify(components.map(c => ({ name: c.name, prod_paths: c.prod_paths, coverage_pct: c.coverage_pct })))}\n\n` +
      `Apply ${dial.T} mutants on lines the summary calls UNCOVERED. Choose the ${dial.T} sites where the summary is MOST LIKELY WRONG, and state that suspicion in why_suspected for each:\n` +
      `  - production code exercised by tests that spawn a subprocess, start a server, or drive a real service — instrumentation commonly misses another process entirely, and integration tests are where that happens;\n` +
      `  - an uncovered range sitting INSIDE a function whose other lines are covered;\n` +
      `  - a component whose coverage_pct looks implausibly low against test files that clearly exercise it.\n` +
      `Use the same operators as the audit's other mutants and keep each diff small. For each: apply → run the full test command → record outcome → revert per the protocol.\n\n` +
      `WHAT THE OUTCOMES MEAN: a KILLED mutant is the finding — a test executed a line the coverage command reported as uncovered, so the data that ranked this audit's sites under-reports. Record killed_by. ` +
      `A SURVIVED mutant restates what the summary already said and is worth nothing; still record it so the report can say how many sites were probed, and expect most of them.\n` +
      `Set ran=true only if the protocol completed and the integrity gate passed.`,
      { label: 'coverage-truth', phase: 'Probes', schema: COVERAGE_TRUTH_SCHEMA }
    )
    const kills = ((coverageTruth && coverageTruth.mutants) || []).filter(m => m.outcome === 'KILLED')
    log(`Coverage-truth probe: ${kills.length} kill(s) of ${((coverageTruth && coverageTruth.mutants) || []).length} mutant(s)` +
        `${kills.length ? ' — the coverage command under-reports; strong is now unreachable' : ''}`)
    if (!coverageTruth || !coverageTruth.integrity_ok) {
      const j = await janitor('coverage-truth', 'truth',
        coverageTruth ? 'failed its integrity gate' : 'died mid-run', 'Probes')
      if (j) log(`Janitor coverage-truth: ${j.summary}`)
    }
  }

  const unitSplit = baseline.unit_split || { declared: false }

  // Two ways the probe has no question to ask, and each must report itself as NOT RUN.
  // The second is the subtle one: with nothing to deny, the denied run is just the suite
  // again — it passes, and an empty failures list would read as proven isolation.
  const nothingToDeny = !(unitSplit.external_env && unitSplit.external_env.length) && !unitSplit.deny_recipe

  if (dial.denial) {
    if (!unitSplit.declared || !unitSplit.unit_selector) {
      denial = {
        ran: false,
        skipped_reason: `the repository declares no unit/integration split${unitSplit.why_not ? ` — ${unitSplit.why_not}` : ''}`,
      }
      log(`Denial probe: skipped — ${denial.skipped_reason}`)
    } else if (nothingToDeny) {
      denial = {
        ran: false,
        skipped_reason: 'nothing external to deny — the production code reads no environment variable naming a host, URL, port, DSN or credential, so a denied run would prove nothing about isolation',
      }
      log(`Denial probe: skipped — ${denial.skipped_reason}`)
    } else {
      denial = await agent(
        `You are the unit-isolation probe of a test-suite audit of ${repoRoot}. Read-only with respect to FILES: change nothing in the repository, and change git state not at all. Your only lever is the environment of one command.\n\n` +
        `This repo declares its unit tests here: ${unitSplit.source || '(source not recorded)'}\n` +
        `Unit selector: ${unitSplit.unit_selector}\n` +
        `External environment the production code actually reads: ${(unitSplit.external_env || []).join(', ') || '(none recorded)'}\n` +
        `Deny recipe (from the baseline): ${unitSplit.deny_recipe}\n\n` +
        `Run the unit selector ONCE with that environment denied, wrapped in \`timeout 590\`, from ${repoRoot}.\n` +
        `A unit test does not need a database, a socket, a broker, or any other external process. So every test that fails ONLY because the environment was taken away is an integration test wearing a unit-test label: it costs CI time under a name that promises speed, and it hides the true cost of the integration coverage. ` +
        `Record each one in failures with its name, the error line proving what it reached for, and the resource it wanted (database, network, broker, filesystem path outside tmp).\n` +
        `A test that fails for an unrelated reason is not a finding — leave it out and note it.\n` +
        `BEFORE reporting a clean result, confirm the run was capable of failing: at least one variable in the recipe must be one the production code reads, and the denied value must be one that cannot resolve. ` +
        `If neither holds — the recipe touched nothing the code consults, or the selector would not run — set ran=false with skipped_reason saying so. ` +
        `An empty failures list means "every unit test survived losing its external environment"; it must never mean "there was nothing to take away", because the report cannot tell those apart.`,
        { label: 'denial', phase: 'Probes', schema: DENIAL_SCHEMA }
      )
      log(`Denial probe: ${denial && denial.ran ? `${((denial.failures) || []).length} mislabelled unit test(s)` : 'did not run'}`)
    }
  }

  const probeNotes = {
    truth_skipped: dial.T > 0 && !(coverageTruth && coverageTruth.ran)
      ? ((coverageTruth && coverageTruth.skipped_reason) || 'the probe agent did not complete')
      : '',
    denial_skipped: dial.denial && !(denial && denial.ran)
      ? ((denial && denial.skipped_reason) || 'the probe agent did not complete')
      : '',
  }

  // ── Phase 4 — Per-component workers

  const workerPrompt = (comp, idx) => {
    const workspaceInstructions = workspaceProtocol(idx)

    return (
      `You are the worker auditing ONE component of the test suite of ${repoRoot}.\n` +
      `Component: ${comp.name}\nProduction paths: ${JSON.stringify(comp.prod_paths)}\n` +
      `Test selector (run tests with exactly this): ${comp.test_selector}\n` +
      `Suite facts: filter syntax ${baseline.filter_syntax || 'n/a'}; shuffle flag ${baseline.shuffle_flag || 'none'}.\n` +
      (coverageOn
        ? `Coverage hint — a RANKING preference, never a filter: read ${scratchDir}/coverage_summary.json, one normalized document, plain JSON. Find each production file by its repo-relative path in the "files" array. ` +
          `Prefer sites inside covered_ranges: a line the tests already reach yields its answer in one run. But this is the repository's own claim and this audit does not trust it — a line in uncovered_ranges is a legal target, and step 3b settles which lines actually run.\n\n`
        : `No coverage report is available for this repo, and none is needed: step 3b measures reachability directly, per site. Choose sites from the code and the tests themselves.\n\n`) +
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
      `3. SENSITIVITY — ${dial.K} mutants. Pick sites anywhere in this component's production paths, preferring branch-dense, recently-churned code whose functions or classes this component's own test files name — a symbol the tests call by name is the likeliest to be executed. One mutant per site; spread across files where possible. ` +
      `Operators, with the name to record for each: negate a condition (negate-condition); flip a comparison, < ↔ <= or == ↔ != (flip-comparison); ±1 on a boundary constant (boundary-constant); delete a guard clause/early return (delete-guard); swap same-typed arguments (swap-args); replace a constant with 0, 1, "" or a null-equivalent (replace-constant); && ↔ || (logic-operator); delete a statement whose result is unused (delete-statement); return a constant instead of the computed value (return-constant).\n` +
      `BOUNDARY RULE: the edge cases that break in production — an empty collection, a single item, the maximum, the line between valid and invalid — live in comparisons, size and limit constants, and empty/null guards. Where this component's production code contains any of those constructs, at least ONE mutant must be boundary-class: flip-comparison, boundary-constant, delete-guard, or replace-constant. A mix drawn only from the other operators leaves every boundary unprobed, and a suite that pins no edge case would score clean on it. Where the code genuinely holds no such construct, record that in notes.\n` +
      `RULE: before applying each mutant, STATE the behavior change you believe it introduces (e.g. "empty input now passes validation"). If you cannot state one, pick a different site — never apply an edit with no statable behavior change.\n` +
      `For each mutant: apply (keep the diff ≤ ~15 lines) → run the selector → record operator (exactly one of the names above) and outcome KILLED (with killed_by = the failing test) or SURVIVED (with implication = what broken behavior would ship undetected) → revert per the workspace protocol.\n\n` +
      `3b. REACHABILITY — one probe per SURVIVING mutant, and none for the others. This is what lets this audit run without trusting a coverage report, so do not skip it.\n` +
      `A survivor has two innocent explanations: no test executes that line, or the mutation changes nothing observable. This step removes the first.\n` +
      `A KILLED mutant needs no probe and must not get one — a test failed on it, so the line demonstrably ran: record reached="yes" with the killing test as reach_evidence and spend no run on it.\n` +
      `For each SURVIVOR: at the SAME site, in place of the mutant, apply the most lethal one-line edit the language allows — throw an exception carrying the marker string TT-REACH ` +
      `(Python \`raise Exception("TT-REACH")\`, JavaScript \`throw new Error("TT-REACH")\`, Go \`panic("TT-REACH")\`, Java \`throw new RuntimeException("TT-REACH")\`, Ruby \`raise "TT-REACH"\`). Run the selector once, then revert per the workspace protocol. Read the outcome:\n` +
      `  - a test FAILED and the output names TT-REACH → reached="yes". The tests execute this line and assert nothing the mutation breaks: a real blind spot. reach_evidence = the failing test.\n` +
      `  - a test FAILED but the marker is nowhere in the output → still reached="yes", and this is COMMON: a browser harness with no pageerror handler, or any runner that swallows a subprocess's stderr, never echoes it. Read the red selector as the signal, and say in reach_evidence that the marker was not surfaced and which test went red.\n` +
      `  - the selector stayed GREEN → run a CONTROL probe before you conclude anything. Put the same throw on a neighbouring line the tests certainly DO reach — the sibling branch of the same conditional, the statement above it — and run the selector again. ` +
      `Control turns the selector RED → the harness does surface a throw from here, so the green result is real: reached="no". No test executes this line at all. That is UNTESTED CODE, not a weak assertion, and the report must say so — the fix is a new test, never a stronger one. reach_evidence = "selector green with a throw at the site; control throw at <line> turned it red". ` +
      `Control ALSO stays green → the harness swallows throws in this file and the probe can decide nothing: reached="inconclusive". Skipping the control makes "no test reaches it" and "nothing here can ever fail" look identical, and they are opposite findings.\n` +
      `  - the edit did not compile or parse (an unreachable-statement or missing-return error is the common one), or the site sits inside a catch/rescue/recover broad enough to swallow the throw → reached="inconclusive", with which of the two it was in reach_evidence. ` +
      `Never guess: a build error proves nothing about the tests, and a swallowed throw looks exactly like an unreached line.\n\n` +
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
    // A survivor the reachability probe proved unreached is not an equivalence question:
    // no test runs the line, and the audit MEASURED that rather than arguing it. Sending it
    // to a refuter spends an agent to risk dropping a proven finding on a reading of code.
    const survivors = (workerResult.mutants || []).filter(m => m.outcome === 'SURVIVED' && m.reached !== 'no')
    const brittle = (workerResult.noops || []).filter(n => n.broke)
    if (survivors.length === 0 && brittle.length === 0) return workerResult

    const verdicts = await parallel([
      ...survivors.map(m => () =>
        agent(
          `Adversarial verification in a test-suite audit of ${repoRoot}. Read-only.\n` +
          `A mutant SURVIVED (no test failed). Try to REFUTE the finding by proving the mutant is EQUIVALENT ` +
          `(no observable behavior change)${m.reached === 'yes' ? '' : ' or sits in dead/unreachable code'}.\n` +
          `File: ${m.file}:${m.line} (repo-relative — resolve it against ${repoRoot}; the worker's workspace no longer exists)\n` +
          `Diff:\n${m.diff}\nWorker's claimed behavior change: ${m.stated_behavior_change}\n` +
          `MEASURED reachability at this site: ${m.reached || 'not measured'}${m.reach_evidence ? ` — ${m.reach_evidence}` : ''}.\n` +
          (m.reached === 'yes'
            ? `The audit already PROVED a test executes this line: a throw at the same site failed a test. "Nothing reaches it" is therefore not available to you — equivalence is the only refutation left.\n`
            : '') +
          `\nRead the surrounding code. refuted=true ONLY if you can concretely argue ${m.reached === 'yes' ? 'equivalence' : 'equivalence or unreachability'} (state the argument in reason). ` +
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

  phase('Workers')
  let workerResults
  // Findings accumulated so far, and the components the cap stopped us taking on. A worker
  // only mutates a component if the count is still under the cap when its turn comes up —
  // pipeline() queues past the concurrency width, so this gate is exactly "do not start new
  // work", never "abandon work in flight".
  let signalCount = 0
  const cappedComponents = []
  const underCap = (comp) => {
    if (signalCount < FINDINGS_CAP) return true
    cappedComponents.push(comp.name)
    log(`Skipping component ${comp.name}: the audit already has ${signalCount} findings (cap ${FINDINGS_CAP}).`)
    return false
  }

  if (parallelWorkers) {
    // Worktree mode: workers fan out; each survivor verifies as soon as its worker lands.
    workerResults = await pipeline(
      components,
      (comp, _orig, idx) => underCap(comp)
        ? agent(workerPrompt(comp, idx),
          { label: `worker:${comp.name}`, phase: 'Workers', schema: WORKER_SCHEMA })
        : null,
      async (res, comp, idx) => {
        if (cappedComponents.includes(comp.name)) return null
        if (!res || !res.integrity_ok) {
          const j = await janitor(comp.name, idx, res ? 'failed its integrity gate' : 'died mid-run')
          if (j) log(`Janitor ${comp.name}: ${j.summary}`)
        }
        const verified = await verifierStage(res, comp)
        signalCount += findingSignals(verified)
        return verified
      }
    )
  } else {
    // Live-tree (or unprobed-hermeticity) mode: strictly one worker at a time; the
    // tree must be verified restored before the next worker may start.
    workerResults = []
    for (let i = 0; i < components.length; i++) {
      if (!underCap(components[i])) {
        workerResults.push(null)
        continue
      }
      const res = await agent(workerPrompt(components[i], i),
        { label: `worker:${components[i].name}`, phase: 'Workers', schema: WORKER_SCHEMA })
      if (!res || !res.integrity_ok) {
        const j = await janitor(components[i].name, i, res ? 'failed its integrity gate' : 'died mid-run')
        if (j) log(`Janitor ${components[i].name}: ${j.summary}`)
      }
      const verified = await verifierStage(res, components[i])
      signalCount += findingSignals(verified)
      workerResults.push(verified)
    }
  }

  const workers = workerResults.filter(Boolean)
  const audited = workers.filter(w => w.audited)
  log(`Workers: ${audited.length}/${components.length} component(s) fully audited (mode=${mode}${parallelWorkers ? ', parallel' : ', serialized'})`)

  const scoreGate = scoreabilityAbort(workers)
  if (scoreGate) {
    return await abortReport(
      scoreGate.reason,
      `Components selected: ${components.length} (${components.map(c => c.name).join(', ') || 'none'})\n` +
      `Workers returning a record: ${workers.length}\n` +
      `Workers reporting audited=true: ${scoreGate.auditedCount}\n` +
      `Mutants across audited components: 0\n` +
      `Findings on other axes (flakes/no-ops/delays): 0\n` +
      (scoreGate.perWorker ? `Per worker:\n${scoreGate.perWorker}\n` : '') +
      `Mode: ${mode}${parallelWorkers ? '' : ' (serialized)'}, level=${level}\n` +
      `Baseline: cmd="${baseline.test_cmd}" wall=${baseline.wall_s}s coverage=${baseline.coverage.pct != null ? baseline.coverage.pct + '%' : 'none'} ` +
      `can_slice=${baseline.can_slice} filter_syntax=${baseline.filter_syntax || 'none found'}`,
      'Start from the per-worker lines above. "not audited" citing filtering means the suite could not be sliced to a single component — check can_slice and filter_syntax and scope the audit to one component with a known-good filter; citing the workspace means the worker could not write to the scratch dir or the integrity check failed. "audited, 0 mutants" with verify notes means every injected mutant was refuted as equivalent, so the mutation targets need widening rather than the suite being at fault.'
    )
  }

  // ── Phase 5 — Synthesis

  phase('Synthesis')

  const notChecked = notCheckedList({ level, dial, baseline, components, workerResults, skippedComponents, cappedComponents, mode, probes: probeNotes })

  const truthKills = ((coverageTruth && coverageTruth.mutants) || []).filter(m => m.outcome === 'KILLED')
  const untestedChurn = (grouping && grouping.untested_churn) || []
  const reach = reachabilitySummary(workers)

  const report = await agent(
    `Assemble the final test-suite strength report for ${repoRoot}. Be adversarial and honest; a strong verdict must be earned.\n\n` +
    `AUDIT SETUP: level=${level}, mode=${mode}${parallelWorkers ? '' : ' (serialized)'}, dials K=${dial.K} M=${dial.M} D=${dial.D} R=${dial.R} T=${dial.T} denial=${dial.denial}.\n` +
    `${hermeticityNote ? 'HERMETICITY: ' + hermeticityNote + '\n' : ''}` +
    `BASELINE (measured): ${JSON.stringify({ test_cmd: baseline.test_cmd, wall_s: baseline.wall_s, coverage_pct: baseline.coverage.pct, shuffle_flag: baseline.shuffle_flag, dirty_tree: baseline.dirty_tree, slow_tests: baseline.slow_tests }, null, 2)}\n\n` +
    `COVERAGE-TRUTH PROBE (mutants on lines the coverage command called UNCOVERED; a KILLED one proves it under-reports, a SURVIVED one is worth nothing):\n` +
    `${coverageTruth ? JSON.stringify(coverageTruth, null, 2) : '(not run at this level)'}\n\n` +
    `UNIT-ISOLATION DENIAL PROBE (the declared unit slice run with its external environment taken away):\n` +
    `${denial ? JSON.stringify(denial, null, 2) : '(not run at this level)'}\n\n` +
    `REACHABILITY (every mutation site at an audited component, classified by what the run proved — a killed mutant proves its own line runs, and each survivor earned one throw probe. This is what replaces a trusted coverage report):\n` +
    `${JSON.stringify(reach, null, 2)}\n` +
    `${coverageOn ? 'The repo also exposes a coverage command; it ranked candidate sites and was itself probed above.' : 'This repo exposes NO coverage command. That cost the audit a site-ranking hint and the coverage-truth probe, nothing else — every reachability figure above was measured by this run.'}\n\n` +
    `UNTESTED CODE, CHURN-WEIGHTED (the REPOSITORY'S OWN coverage report joined with git churn — nothing was probed to produce it, and this audit did not verify it):\n` +
    `${JSON.stringify(untestedChurn, null, 2)}\n\n` +
    `PER-COMPONENT WORKER RECORDS${dial.verify ? ' (survivors already adversarially verified; refuted findings dropped, see notes)' : ''}:\n${JSON.stringify(workers, null, 2)}\n\n` +
    `NOT-CHECKED LIST (include verbatim, plus anything you notice is missing):\n${JSON.stringify(notChecked, null, 2)}\n\n` +
    `Build the report:\n` +
    `1. scores: kill_rate = killed / (killed + survivors whose reached is "yes" or "inconclusive") across AUDITED components. ` +
    `Survivors with reached="no" leave BOTH halves of that ratio: no test executes those lines, so they measure missing tests rather than weak ones, and counting them would report a coverage gap as an assertion gap. ` +
    `An "inconclusive" survivor stays in the denominator — the pessimistic reading, because the audit could not prove the line is unreached. ` +
    `The coverage-truth mutants are NOT part of this ratio either; they measure the coverage command rather than the tests. ` +
    `unreached_sites = mutation sites with reached="no"; brittle_breaks = no-ops that broke tests; flaky_tests = distinct flaky tests; timing_sensitive = distinct tests broken by delay injection; ` +
    `coverage_truth_kills = KILLED coverage-truth mutants; mislabelled_unit_tests = distinct tests in the denial probe's failures; suite_wall_s = baseline wall.\n` +
    `2. findings: one per proven weakness. axis: sensitivity — TWO kinds, which must never be merged because their fixes are opposite: ` +
    `(a) a mutant that SURVIVED with reached="yes" or "inconclusive" — the tests run this code and do not pin the behavior the mutation changed, so the fix is a stronger assertion; ` +
    `(b) a mutant that SURVIVED with reached="no" — no test executes the line at all, so the observation reads "no test reaches <file>:<line>" and the fix is a new test. Its evidence is the throw probe that left the suite green, and it is never candidate=true: unreachability here was measured, not argued. ` +
    `Then: specificity (brittle break), reliability (flake), timing (test broken by delay injection), speed (slow suite/tests), ` +
    `isolation (a "unit" test that failed once its external environment was denied — name the test and the resource it reached for; major when several share one resource, minor for an isolated case), ` +
    `auditability (a KILLED coverage-truth mutant: the repo's coverage command under-reports, and any site it ranked was ranked from data that is provably incomplete — severity major, candidate false, evidence = the diff and the test that killed it` +
    `${coverageOn ? '' : '; and, on this run, that the repo exposes no coverage-summary command at all — severity minor, candidate false, evidence = the baseline how_to_enable text. The audit did not need it, so it is not a blocker; it is the one axis the missing command touches'}). ` +
    `Each carries the concrete evidence (the diff or run-log excerpt), an implication stating what broken behavior would ship undetected or what the weakness costs, and candidate: ` +
    `${dial.verify
      ? 'false for verify-confirmed survivors and brittle breaks — EXCEPT items flagged verify_failed=true (their verify agent failed), which stay candidate=true; '
      : 'true for surviving mutants with reached="yes" or "inconclusive", and for brittle breaks (no verify pass ran, so equivalence stays possible); '}` +
    `a survivor with reached="no" is candidate=false at EVERY level — the throw probe measured that no test runs the line, and there is nothing left for a human to weigh; ` +
    `delay-injection findings are ALWAYS candidate=true (a latency contract may be legitimate). Dedupe: the same weakness surfaced twice is ONE finding with the strongest evidence.\n` +
    `Severity rubric: blocker = a core behavior could be fully inverted/removed undetected or a test is proven vacuous; major = a meaningful branch, bound, or computation is unpinned, or a proven flake/brittle break; minor = a narrow edge case or an inefficiency. ` +
    `Timing findings: major when multiple tests share the timing dependence, minor for an isolated test.\n` +
    `3. proposals: concrete next actions — "add a test that kills this survivor in <file>:<line> (assert <behavior>)", "quarantine flaky test X", "split/exclude slow test Y", ` +
    `"move test Z into the integration suite, or give it a double for <resource>", "fix the coverage command so it sees <file>". Each tied to its finding. No code, just the actions. ` +
    `Classify every one with decision: "settled" when there is one correct answer and no consequence anyone could reasonably weigh differently — ` +
    `a verify-confirmed survivor with an obvious missing assertion is settled, and needs no question. "open" when a competent person could answer ` +
    `differently: it trades one cost against another, picks between conventions the suite already uses, or is big enough that "not now" is a real ` +
    `answer. Anything resting on a finding with candidate=true is open by construction — a possible equivalent mutant or a legitimate latency ` +
    `contract is exactly the call a human has to make. Every open proposal MUST also carry question (what the human is being asked, in ` +
    `ASD-STE100 Simplified Technical English — one idea per sentence, every identifier and abbreviation expanded — so it is understandable ` +
    `without having watched the audit), options (the answers they can pick between), and recommendation (which one you ` +
    `would take and the tradeoff that decided it). Leave those three off settled proposals.\n` +
    `4. components table: per component kill_rate, flakes, brittle, slice_wall_s, audited.\n` +
    `5. untested_churn: copy the derived list above through unchanged, in the order given. Present it as what it is — the REPOSITORY'S OWN coverage claim, unverified by this audit, churn-weighted and not risk-ranked: it ranks by how often a file changes and how much of it is untested, neither of which says how dangerous the gap is. No severity, no findings built from it, and it changes no score. ` +
    `The proven-unreached sites are its audited counterpart, and those DO carry findings.` +
    `${coverageOn ? '' : ' This run had no coverage report, so the list is empty — say that in the section rather than leaving it blank.'}\n` +
    `6. checked: one compact prose line — components audited, mutants applied and which operator classes they covered, reachability probes run and what they proved, no-ops, delays, reruns, whether a coverage report was available at all, probes run, mode.\n` +
    `7. verdict: untrustworthy = baseline flaky enough to distrust results; strong = kill_rate >= 0.75 across audited components AND zero flakes AND zero brittle breaks AND suite < ~120 s — must be EARNED; weak = kill_rate low or vacuous tests proven; else adequate.\n` +
    `${truthKills.length
      ? `COVERAGE CAP (binding): ${truthKills.length} coverage-truth mutant(s) were killed, so this repo's coverage command demonstrably under-reports. It ranked this audit's mutation sites and it produced untested_churn, so the sample was steered by data now proven incomplete — it pulled the run toward code the report called covered, which is exactly where the report was wrong. kill_rate is still measured on sites proven reachable, but it is a rate over a biased sample of them. The verdict therefore CANNOT be 'strong' — cap it at 'adequate' or lower — and the headline must say the coverage source is unreliable.\n`
      : ''}` +
    `${reach.sites > 0 && reach.unreached >= reach.sites * UNREACHED_CAP_RATIO
      ? `REACHABILITY CAP (binding): ${reach.unreached} of the ${reach.sites} mutation sites are run by NO test — proven, not inferred: a throw at each of those sites left the suite green. kill_rate excludes them, so it is a rate over the code the tests actually execute and says nothing about the rest. The verdict therefore CANNOT be 'strong' — cap it at 'adequate' or lower — and the headline must give the share of mutation sites that no test reaches.\n`
      : ''}` +
    `${cappedComponents.length
      ? `FINDINGS CAP (binding): the audit stopped taking on new components after reaching ${FINDINGS_CAP} findings, so ${cappedComponents.length} component(s) were never mutated (${cappedComponents.join(', ')}). kill_rate is a rate over the components that DID run — the headline must say the audit was capped, or the score reads as covering the whole suite.\n`
      : ''}` +
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
      reachability: reach,
      untested_churn: untestedChurn,
      coverage_truth: coverageTruth,
      denial,
      workers,
      not_checked: notChecked,
      hermeticity_note: hermeticityNote,
    },
  }
} else {
  // No `agent` hook: the Workflow runtime failed to inject it. Fail LOUD — returning
  // undefined here would be recorded by the harness as status:completed, i.e. a silent
  // no-op.
  throw new Error('test-tests: the Workflow runtime did not inject the `agent` hook')
}
