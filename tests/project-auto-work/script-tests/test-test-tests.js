'use strict';
// test-test-tests.js — unit tests for the pure helpers in
// plugins/project-auto-work/skills/test-tests/workflows/test-tests.js.
//
// test-tests.js is a Workflow-tool script: it begins with `export const meta` (ESM syntax)
// and uses top-level `await`/`return`, so stock require()/import() cannot load it. We strip
// the lone `export ` keyword and run the body inside an async-function wrapper — the same
// shape the Workflow runtime uses. The script assigns module.exports before its
// orchestration block, so the helpers are reachable whichever path that takes.
//
// This matters more here than in the sibling workflows: the only other way to exercise
// these gates is a full audit run, and an audit run mutates production code.
//
// Coverage:
//   - normalizeArgs parses a JSON-*string* args payload and rejects an unusable config
//     before anything mutates a file
//   - the level vocabulary shared with the two project-review skills, and its dials
//   - baselineAbort's GATE ORDERING — a timed-out baseline reports green=false too, so
//     the speed gate must win over the red gate
//   - scoreabilityAbort distinguishes "nobody finished" from "finished with nothing to
//     score", and abstains when any axis carries a measurement
//   - notCheckedList names every axis that did not run, including a probe that was
//     budgeted but could not run — silence there would read as a passing measurement
//   - a repository with no coverage report is still auditable: no gate trips, the
//     coverage-truth probe skips with a reason, and the absence is disclosed
//   - reachabilitySummary counts what the throw probes proved, and a suite that runs
//     almost none of the probed code cannot reach the top verdict
//   - the two audit-wide probes (coverage-truth, unit-isolation denial) are spawned once
//     per audit, are level-gated, and a killed coverage-truth mutant caps the verdict
//   - the bad-args bailout returns the diagnostic error object without spawning agents
//   - a broken runtime (no agent hook) fails loudly instead of no-op

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = path.resolve(
  __dirname,
  '../../../plugins/project-auto-work/skills/test-tests/workflows/test-tests.js'
);

async function load(globals = {}) {
  const src = fs.readFileSync(SCRIPT, 'utf8').replace(/^export const meta/m, 'const meta');
  const moduleObj = { exports: {} };
  const names = Object.keys(globals);
  const wrapper = `(async function(module, exports${names.length ? ', ' + names.join(', ') : ''}) {\n${src}\n})`;
  const fn = vm.runInThisContext(wrapper, { filename: SCRIPT });
  const ret = await fn(moduleObj, moduleObj.exports, ...names.map((n) => globals[n]));
  return { exports: moduleObj.exports, ret };
}

let pass = 0;
let fail = 0;

function ok(label) {
  console.log(`PASS: ${label}`);
  pass += 1;
}

function bad(label, detail) {
  console.log(`FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  fail += 1;
}

function eq(label, expected, actual) {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  if (e === a) ok(label);
  else bad(label, `expected ${e}, got ${a}`);
}

function truthy(label, value, detail) {
  if (value) ok(label);
  else bad(label, detail);
}

// A baseline that trips no abort gate. Each gate test spreads one bad field over it.
const healthyBaseline = () => ({
  test_cmd: 'bash tests/run-all.sh',
  green: true,
  wall_s: 12,
  can_slice: true,
  filter_syntax: 'path',
  slow_tests: 'none',
  shuffle_flag: '--shuffle',
  worktree_ok: true,
  dirty_tree: false,
  coverage: { obtained: true, summary_file: '/tmp/s.json', pct: 81, producer_cmd: 'make coverage' },
});

async function main() {
  let agentCalled = false;
  const throwIfCalled = (name) => () => { throw new Error(`${name} must not be called on the bad-args path`); };
  const { exports: helpers, ret } = await load({
    agent: () => { agentCalled = true; throw new Error('agent must not be called on the bad-args path'); },
    args: '{}',
    log: () => {},
    phase: throwIfCalled('phase'),
    parallel: throwIfCalled('parallel'),
    pipeline: throwIfCalled('pipeline'),
  });

  const { normalizeArgs, dialFor, baselineAbort, scoreabilityAbort, notCheckedList, findingSignals,
    reachabilitySummary, DIALS, UNREACHED_CAP_RATIO } = helpers;

  const required = { normalizeArgs, dialFor, baselineAbort, scoreabilityAbort, notCheckedList, findingSignals, reachabilitySummary };
  const missingExport = Object.keys(required).filter((k) => typeof required[k] !== 'function');
  if (missingExport.length) {
    bad('test-tests.js exposes its pure helpers', `missing or not a function: ${missingExport.join(', ')}`);
    console.log(`\nResults: ${pass} passed, ${fail} failed`);
    process.exit(1);
  }
  ok('test-tests.js exposes its pure helpers');

  // ── normalizeArgs ────────────────────────────────────────────────────────────
  const good = normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts' });
  eq('normalizeArgs: a valid config carries no error', null, good.error);
  eq('normalizeArgs: level defaults to medium', 'medium', good.level);
  truthy('normalizeArgs: the coverage validator resolves under scriptsDir',
    good.validateTool.includes('/s/scripts/validate-coverage-summary.py'));
  truthy('normalizeArgs: the schema reference resolves beside the scripts dir',
    good.schemaRef.endsWith('/s/references/coverage-summary-schema.md'));
  eq('normalizeArgs: a trailing slash on scriptsDir does not double the separator',
    good.schemaRef, normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts/' }).schemaRef);

  // The regression the seam exists for: args arriving as a JSON STRING must be parsed.
  eq('normalizeArgs: JSON-string payload is parsed', '/parsed/root',
    normalizeArgs('{"repoRoot":"/parsed/root","scriptsDir":"/s/scripts"}').repoRoot);

  truthy('normalizeArgs: a missing repoRoot is rejected',
    /repoRoot and scriptsDir/.test(normalizeArgs({ scriptsDir: '/s' }).error || ''));
  truthy('normalizeArgs: a missing scriptsDir is rejected',
    /repoRoot and scriptsDir/.test(normalizeArgs({ repoRoot: '/r' }).error || ''));
  truthy('normalizeArgs: non-JSON string is rejected', normalizeArgs('not json').error);
  truthy('normalizeArgs: undefined is rejected', normalizeArgs(undefined).error);

  // An unsubstituted "<…>" placeholder from the SKILL.md args template is a NON-EMPTY
  // string, so a truthiness check passes it through — and this workflow interpolates
  // repoRoot into `git -C <root> worktree add` and then mutates production files under it.
  truthy('normalizeArgs: an unsubstituted placeholder repoRoot is rejected before any worktree',
    /absolute path/.test(normalizeArgs({ repoRoot: '<path>', scriptsDir: '/s/scripts' }).error || ''));
  truthy('normalizeArgs: a relative repoRoot is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: 'some/dir', scriptsDir: '/s/scripts' }).error || ''));
  truthy('normalizeArgs: a relative scriptsDir is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: '/r', scriptsDir: 'rel/scripts' }).error || ''));
  // The error names two arguments; without the keys that arrived, a caller who sent
  // `scripts_dir` cannot tell which of the two is the wrong one.
  eq('normalizeArgs: the received keys are echoed for diagnosis',
    ['repoRoot', 'scripts_dir'], normalizeArgs({ repoRoot: '/r', scripts_dir: '/s' }).receivedKeys);

  // scratchDir is interpolated into `git worktree add` and `git worktree remove --force`.
  // A relative value would put worktrees and backups inside the repository under audit;
  // an unsubstituted "<SCRATCH>" placeholder is truthy and slips past a bare falsy check.
  truthy('normalizeArgs: a relative scratchDir is rejected before any worktree is created',
    /absolute path/.test(normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', scratchDir: '<SCRATCH>' }).error || ''));
  eq('normalizeArgs: an absolute scratchDir is accepted', null,
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', scratchDir: '/tmp/x' }).error);

  // ── the shared level vocabulary and its dials ────────────────────────────────
  for (const lvl of ['low', 'medium', 'high', 'ultra']) {
    eq(`level: ${lvl} is accepted`, lvl, normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: lvl }).level);
  }
  eq('level: an unknown token falls back to medium', 'medium',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'turbo' }).level);
  eq('level: is case-insensitive', 'high',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'HIGH' }).level);

  eq('dials: low skips no-op and delay probes', [0, 0], [dialFor('low').M, dialFor('low').D]);
  // The two audit-wide probes are per AUDIT, not per component — their budget must not
  // scale with the component count, or one repo-level question costs a suite run each time.
  eq('dials: low skips both audit-wide probes', [0, false], [dialFor('low').T, dialFor('low').denial]);
  eq('dials: the coverage-truth budget deepens with the level',
    [0, 3, 5], ['low', 'medium', 'high'].map((l) => dialFor(l).T));
  eq('dials: the denial probe runs at medium and above',
    [false, true, true], ['low', 'medium', 'high'].map((l) => dialFor(l).denial));
  eq('dials: low serializes workers rather than probing hermeticity', false, dialFor('low').hermeticity);
  eq('dials: the verify pass runs at high, not below',
    [false, false, true], ['low', 'medium', 'high'].map((l) => dialFor(l).verify));
  // ultra is part of the shared vocabulary but this audit has no rung above high: its
  // cost is the suite's own runtime, not a refutation pass.
  eq('dials: ultra runs the high dials', DIALS.high, dialFor('ultra'));
  eq('dials: an unknown level falls back to the medium dials', DIALS.medium, dialFor('turbo'));
  eq('dials: the level in the config selects the dial',
    DIALS.high, normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'ultra' }).dial);

  // ── baselineAbort ────────────────────────────────────────────────────────────
  eq('baselineAbort: a healthy baseline proceeds', null, baselineAbort(healthyBaseline(), '/schema.md'));

  // THE ordering regression: a suite killed by the 600 s timeout reports wall_s=601 AND
  // green=false. Evaluated in the wrong order it would be reported as a failing suite,
  // sending the user to debug tests that never actually ran.
  const timedOut = baselineAbort({ ...healthyBaseline(), wall_s: 601, green: false }, '/schema.md');
  truthy('baselineAbort: a timed-out baseline reports "too slow", not "red" (gate ordering)',
    timedOut && /too slow/.test(timedOut.reason), `got ${timedOut && timedOut.reason}`);
  truthy('baselineAbort: the slow abort says the pass/fail state is unknown',
    timedOut && /pass\/fail state is unknown/.test(timedOut.evidence));
  truthy('baselineAbort: the slow abort carries the slowest tests as remediation input',
    timedOut && timedOut.remediation.includes('slowest tests'));

  const red = baselineAbort({ ...healthyBaseline(), green: false, red_details: 'test_foo failed' }, '/schema.md');
  truthy('baselineAbort: a red suite aborts as unauditable', red && /suite is red/.test(red.reason));
  truthy('baselineAbort: the red abort carries the failing tests', red && red.evidence.includes('test_foo failed'));
  // abortReport keys the verdict off this prefix ('untrustworthy' vs 'not-auditable').
  truthy('baselineAbort: the red reason keeps the prefix the verdict is keyed on',
    red && red.reason.startsWith('suite is red'));

  // Coverage is an optional INPUT, not a gate: the audit proves reachability per site with
  // its own throw probes, so a repo with no coverage command is fully auditable. Each of
  // these three shapes used to abort the run before the first mutant was ever applied.
  eq('baselineAbort: no coverage command does not abort — reachability is measured, not read',
    null, baselineAbort({ ...healthyBaseline(), coverage: { obtained: false, how_to_enable: 'add `make coverage`' } }));
  eq('baselineAbort: a coverage payload the validator rejected does not abort either',
    null, baselineAbort({ ...healthyBaseline(), coverage: { obtained: false, producer_cmd: 'make cov', validation_errors: 'line 3: bad range' } }));
  eq('baselineAbort: obtained=true with no summary file does not abort',
    null, baselineAbort({ ...healthyBaseline(), coverage: { obtained: true, producer_cmd: 'make cov' } }));

  // ── reachabilitySummary ──────────────────────────────────────────────────────
  // What the throw probes proved, and the denominator the verdict cap keys on.
  const mut = (over) => ({ file: 'src/a.js', line: 1, diff: 'd', operator: 'negate-condition',
    stated_behavior_change: 'b', outcome: 'SURVIVED', reached: 'yes', ...over });

  eq('reachabilitySummary: an empty run counts nothing',
    { sites: 0, unreached: 0, inconclusive: 0, reached: 0 }, reachabilitySummary([]));
  eq('reachabilitySummary: each outcome lands in its own bucket',
    { sites: 4, unreached: 1, inconclusive: 1, reached: 2 },
    reachabilitySummary([{ audited: true, mutants: [
      mut({ outcome: 'KILLED' }), mut({}), mut({ reached: 'no' }), mut({ reached: 'inconclusive' })] }]));
  // A component that never completed the protocol proves nothing about what the tests run.
  eq('reachabilitySummary: an unaudited component contributes nothing',
    { sites: 0, unreached: 0, inconclusive: 0, reached: 0 },
    reachabilitySummary([{ audited: false, mutants: [mut({ reached: 'no' })] }]));
  truthy('reachabilitySummary: the cap ratio is a share, not a count',
    UNREACHED_CAP_RATIO > 0 && UNREACHED_CAP_RATIO < 1);

  // ── scoreabilityAbort ────────────────────────────────────────────────────────
  const worker = (over) => ({ component: 'core', audited: true, mutants: [], noops: [], delays: [], flakes: [], ...over });

  eq('scoreabilityAbort: a scoreable mutant means no abort', null,
    scoreabilityAbort([worker({ mutants: [{ outcome: 'KILLED' }] })]));
  // The other three axes are real measurements; aborting on a zero mutant count alone
  // would discard them and label a run that did measure something 'not-auditable'.
  eq('scoreabilityAbort: a flake alone is still a measurement', null,
    scoreabilityAbort([worker({ flakes: [{ test: 't', symptom: 's' }] })]));
  eq('scoreabilityAbort: a no-op break alone is still a measurement', null,
    scoreabilityAbort([worker({ noops: [{ file: 'f', diff: 'd', broke: true }] })]));
  eq('scoreabilityAbort: a delay result alone is still a measurement', null,
    scoreabilityAbort([worker({ delays: [{ file: 'f', line: 1, broke: false }] })]));
  // Only AUDITED components count toward the score's denominator.
  truthy('scoreabilityAbort: mutants on an unaudited component do not count as scoreable',
    scoreabilityAbort([worker({ audited: false, mutants: [{ outcome: 'KILLED' }] })]));

  const nobodyFinished = scoreabilityAbort([
    { component: 'core', audited: false, not_audited_reason: 'selector never went green' },
  ]);
  truthy('scoreabilityAbort: no audited component reports that nothing was measured',
    nobodyFinished && /nothing was measured/.test(nobodyFinished.reason));
  eq('scoreabilityAbort: the audited count is reported', 0, nobodyFinished && nobodyFinished.auditedCount);
  truthy('scoreabilityAbort: an unaudited worker line carries its reason',
    nobodyFinished && nobodyFinished.perWorker.includes('selector never went green'));

  // The second, easily-missed way in: workers completed but the verify stage refuted
  // every mutant as equivalent, so they end audited with an empty array. A fixed reason
  // string would be false here.
  const finishedEmpty = scoreabilityAbort([worker({ notes: '[verify: dropped equivalent mutant]' })]);
  truthy('scoreabilityAbort: audited-but-empty reports the right reason, not "nothing ran"',
    finishedEmpty && /every audited component finished with no scoreable mutant/.test(finishedEmpty.reason));
  eq('scoreabilityAbort: the audited count distinguishes the two cases', 1, finishedEmpty && finishedEmpty.auditedCount);
  truthy('scoreabilityAbort: an audited-but-empty worker line shows 0 mutants and its notes',
    finishedEmpty && finishedEmpty.perWorker.includes('audited, 0 mutants') &&
    finishedEmpty.perWorker.includes('[verify: dropped equivalent mutant]'));
  // A filter on !audited would print an empty block while the counts above say otherwise.
  truthy('scoreabilityAbort: every worker gets a line, audited or not',
    (scoreabilityAbort([worker({}), { component: 'other', audited: false }]) || { perWorker: '' })
      .perWorker.split('\n').length === 2);

  // ── findingSignals ───────────────────────────────────────────────────────────
  // What the cap counts. A killed mutant is the suite working, so counting it would stop the
  // audit early on a strong suite — exactly backwards.
  eq('findingSignals: a dead worker contributes nothing', 0, findingSignals(null));
  eq('findingSignals: killed mutants do not count', 0,
    findingSignals({ mutants: [{ outcome: 'KILLED' }, { outcome: 'KILLED' }] }));
  eq('findingSignals: survivors, flakes and brittle breaks all count', 4,
    findingSignals({
      mutants: [{ outcome: 'SURVIVED' }, { outcome: 'KILLED' }, { outcome: 'SURVIVED' }],
      flakes: [{ test: 'a', symptom: 'b' }],
      noops: [{ broke: true }, { broke: false }],
    }));

  // ── notCheckedList ───────────────────────────────────────────────────────────
  const baseNotChecked = {
    level: 'low',
    dial: DIALS.low,
    baseline: { ...healthyBaseline(), shuffle_flag: '', dirty_tree: true },
    components: [{ name: 'core' }],
    workerResults: [{ component: 'core' }],
    skippedComponents: ['extra'],
    mode: 'worktree',
  };
  const lowList = notCheckedList(baseNotChecked);
  const has = (needle) => lowList.some((s) => s.includes(needle));
  truthy('notCheckedList: names the component beyond the level cap', has('component extra'));
  truthy('notCheckedList: names the missing shuffle flag', has('test-order shuffle'));
  truthy('notCheckedList: names the skipped verify pass', has('equivalent-mutant verification'));
  truthy('notCheckedList: says the verify pass runs at high and ultra',
    lowList.some((s) => /level=high and level=ultra/.test(s)));
  truthy('notCheckedList: names the skipped hermeticity probe', has('hermeticity probe'));
  truthy('notCheckedList: names the skipped no-op probes', has('specificity'));
  truthy('notCheckedList: names the skipped delay injection', has('delay injection'));
  truthy('notCheckedList: names the skipped coverage-truth probe', has('coverage-truth probe'));
  truthy('notCheckedList: says the coverage report was taken on trust when unprobed',
    lowList.some((s) => /taken on trust/.test(s)));
  truthy('notCheckedList: names the skipped denial probe', has('unit-isolation denial probe'));
  truthy('notCheckedList: warns that worktree mode audits HEAD, not the dirty tree',
    has('uncommitted working-tree changes'));
  // A coverage report the repo does not have is no longer a blocker, but its absence still
  // has to be said: unmentioned, the reader assumes sites were ranked by one.
  truthy('notCheckedList: an absent coverage report is disclosed, not hidden',
    notCheckedList({ ...baseNotChecked, baseline: { ...healthyBaseline(), coverage: { obtained: false } } })
      .some((s) => /repository coverage report/.test(s)));
  truthy('notCheckedList: a repo WITH coverage says nothing about a missing report',
    !lowList.some((s) => /repository coverage report/.test(s)));
  // obtained=true with no summary_file leaves nothing to read, so the orchestration treats
  // coverage as absent. This list has to agree with it: the shape used to abort the run, so
  // it only became reachable when coverage stopped being a gate, and a silent skip here
  // would read as a ranking hint the audit never had.
  truthy('notCheckedList: obtained=true with no summary file counts as no coverage report',
    notCheckedList({ ...baseNotChecked, baseline: { ...healthyBaseline(), coverage: { obtained: true, producer_cmd: 'make cov' } } })
      .some((s) => /repository coverage report/.test(s)));

  // A probe that was BUDGETED but could not run is the dangerous case: with nothing said,
  // its absence from the findings reads as a clean measurement.
  const probeSkipped = notCheckedList({
    ...baseNotChecked,
    level: 'high',
    dial: DIALS.high,
    baseline: healthyBaseline(),
    skippedComponents: [],
    probes: { denial_skipped: 'the repository declares no unit/integration split' },
  });
  truthy('notCheckedList: a budgeted probe that could not run names its reason',
    probeSkipped.some((s) => /declares no unit\/integration split/.test(s)));

  // A component the findings cap stopped us reaching has a null worker result, exactly like
  // one whose agent died. Reporting it as a failure would send the reader chasing a crash
  // that never happened, so the cap must claim its own components.
  const cappedList = notCheckedList({
    ...baseNotChecked,
    components: [{ name: 'core' }, { name: 'billing' }],
    workerResults: [{ component: 'core' }, null],
    cappedComponents: ['billing'],
  });
  truthy('notCheckedList: a capped component says the run was already full',
    cappedList.some((s) => /component billing — never audited/.test(s)));
  truthy('notCheckedList: a capped component is NOT reported as a failed worker',
    !cappedList.some((s) => /component billing — worker agent failed/.test(s)));
  truthy('notCheckedList: a genuinely failed worker is still reported as one',
    notCheckedList({
      ...baseNotChecked,
      components: [{ name: 'core' }, { name: 'billing' }],
      workerResults: [{ component: 'core' }, null],
    }).some((s) => /component billing — worker agent failed/.test(s)));

  const highList = notCheckedList({
    ...baseNotChecked,
    level: 'high',
    dial: DIALS.high,
    baseline: healthyBaseline(),
    skippedComponents: [],
    mode: 'worktree',
  });
  eq('notCheckedList: a full high run with a shuffle flag has nothing to disclaim', [], highList);
  truthy('notCheckedList: a worker that died is named',
    notCheckedList({ ...baseNotChecked, dial: DIALS.high, baseline: healthyBaseline(), skippedComponents: [], workerResults: [null] })
      .some((s) => s.includes('worker agent failed')));

  // ── bad-args bailout (orchestration) ─────────────────────────────────────────
  truthy('bailout: bad args return the diagnostic error object',
    ret && typeof ret.error === 'string' && /repoRoot and scriptsDir/.test(ret.error),
    `got ${JSON.stringify(ret)}`);
  eq('bailout: the error object echoes the received args type', 'string', ret && ret.got && ret.got.type);
  if (!agentCalled) ok('bailout: no agent spawned on the bad-args path');
  else bad('bailout: no agent spawned on the bad-args path');

  // ── orchestration ────────────────────────────────────────────────────────────
  // Drive the FULL baseline → grouping → workers → (verify) → synthesis pipeline through
  // stubbed hooks. Without this the orchestration block never executes, so a variable
  // dropped from its destructure would throw a ReferenceError only mid-audit — after
  // workers have already mutated production files.
  const runAudit = async (over, agentOver = {}) => {
    const labels = [];
    const prompts = [];
    const agent = async (prompt, opts = {}) => {
      labels.push(opts.label);
      prompts.push(prompt);
      if (agentOver[opts.label]) return agentOver[opts.label];
      if (opts.label === 'baseline') return agentOver.baseline || healthyBaseline();
      if (opts.label === 'grouping') {
        return { components: [{ name: 'core', prod_paths: ['src/a.js'], test_selector: 'make test' }] };
      }
      if (opts.label.startsWith('worker:')) {
        const survivors = agentOver.__workerSurvivors || 1;
        return {
          component: opts.label.slice('worker:'.length), audited: true, integrity_ok: true,
          mutants: Array.from({ length: survivors }, (_, i) => ({
            file: 'src/a.js', line: i + 1, diff: 'd', stated_behavior_change: 'b', outcome: 'SURVIVED',
            reached: agentOver.__workerReached || 'yes',
          })),
          noops: [], delays: [], flakes: [],
        };
      }
      if (opts.label === 'coverage-truth') {
        return {
          ran: true, integrity_ok: true,
          mutants: [{ file: 'src/a.js', line: 9, diff: 'd', why_suspected: 'driven by a subprocess test', outcome: 'KILLED', killed_by: 'test_x' }],
        };
      }
      if (opts.label === 'denial') return { ran: true, failures: [{ test: 'test_db', error: 'connection refused' }] };
      if (opts.label.startsWith('verify-mutant:')) return { refuted: false };
      return { verdict: 'adequate', headline: 'h', findings: [], proposals: [], checked: 'c', not_checked: [] };
    };
    const { ret } = await load({
      agent,
      args: { repoRoot: '/repo', scriptsDir: '/s/scripts', scratchDir: '/tmp/sc', ...over },
      log: () => {},
      phase: () => {},
      parallel: async (thunks) => Promise.all(thunks.map((t) => t())),
      pipeline: async (items, ...stages) => Promise.all(items.map(async (item, i) => {
        let v = item;
        for (const s of stages) v = await s(v, item, i);
        return v;
      })),
    });
    return { ret, labels, prompts };
  };

  const deep = await runAudit({ level: 'ultra' });
  eq('orchestration: the audit completes and reports', 'adequate',
    deep.ret && deep.ret.report && deep.ret.report.verdict);
  eq('orchestration: it does not abort', undefined, deep.ret && deep.ret.aborted);
  eq('orchestration: ultra verifies the surviving mutant',
    1, deep.labels.filter((l) => l.startsWith('verify-mutant:')).length);
  eq('orchestration: worktree mode is chosen when the baseline probe succeeded',
    'worktree', deep.ret && deep.ret.mode);
  eq('orchestration: the level is echoed back', 'ultra', deep.ret && deep.ret.level);
  // The regression that motivates driving the pipeline: repoRoot and scratchDir reach the
  // worker prompt, which is where worktrees are created and production files are mutated.
  truthy('orchestration: the repo root reaches the worker prompt',
    deep.prompts.some((p) => p.includes('/repo')));
  truthy('orchestration: the scratch dir reaches the worker prompt',
    deep.prompts.some((p) => p.includes('/tmp/sc')));

  // ── the findings cap ─────────────────────────────────────────────────────────
  // Live-tree mode serializes workers, which is the path the cap is built for: each
  // component's findings land before the next component starts. A worktree run fans out
  // inside the concurrency width instead, so the cap can only catch a queued tail — the
  // second assertion pins that difference so it stays a known limit rather than a surprise.
  const manyComponents = (n) => ({
    components: Array.from({ length: n }, (_, i) => ({
      name: `comp-${i + 1}`, prod_paths: [`src/${i + 1}.js`], test_selector: 'make test',
    })),
  });
  const serialCap = await runAudit({ level: 'medium' }, {
    baseline: { ...healthyBaseline(), worktree_ok: false },
    grouping: manyComponents(6),
    __workerSurvivors: 7,
  });
  const serialWorkers = serialCap.labels.filter((l) => l.startsWith('worker:'));
  eq('cap: a serialized audit stops taking on components once the findings are in', 3, serialWorkers.length);
  // raw.not_checked is the list assembled in code; report.not_checked is the agent's copy
  // of it, so the code-assembled one is what proves the cap cannot go unmentioned.
  truthy('cap: the components it never reached are named in not_checked',
    serialCap.ret.raw.not_checked.some((s) => /comp-4 — never audited/.test(s)),
    JSON.stringify(serialCap.ret.raw.not_checked));
  truthy('cap: a skipped component is not reported as a failed worker',
    !serialCap.ret.raw.not_checked.some((s) => /comp-4 — worker agent failed/.test(s)));
  truthy('cap: synthesis is told the run was capped so kill_rate is not read as whole-suite',
    serialCap.prompts.some((p, i) => serialCap.labels[i] === 'synthesis' && /FINDINGS CAP \(binding\)/.test(p)),
    'the synthesis prompt never mentioned the cap');

  // Under the cap every component is still audited.
  const noCap = await runAudit({ level: 'medium' }, {
    baseline: { ...healthyBaseline(), worktree_ok: false },
    grouping: manyComponents(6),
    __workerSurvivors: 1,
  });
  eq('cap: an audit under the cap works every component',
    6, noCap.labels.filter((l) => l.startsWith('worker:')).length);
  truthy('cap: an uncapped run does not tell synthesis it was capped',
    !noCap.prompts.some((p, i) => noCap.labels[i] === 'synthesis' && /FINDINGS CAP/.test(p)));

  const shallow = await runAudit({ level: 'medium' });
  eq('orchestration: below high nothing is verified',
    0, shallow.labels.filter((l) => l.startsWith('verify-mutant:')).length);
  eq('orchestration: the shallow run still reports', 'adequate',
    shallow.ret && shallow.ret.report && shallow.ret.report.verdict);

  // ── a repository with no coverage report ─────────────────────────────────────
  // The change this whole design turns on: coverage used to gate the audit, so a repo
  // without a conforming command got a remediation report and no measurement at all.
  const noCoverageBaseline = {
    ...healthyBaseline(),
    coverage: { obtained: false, how_to_enable: 'add a command emitting the neutral schema' },
  };
  const bare = await runAudit({ level: 'medium' }, { baseline: noCoverageBaseline });
  eq('no-coverage: the audit runs to a report instead of aborting', undefined, bare.ret && bare.ret.aborted);
  eq('no-coverage: components are still worked', 1, bare.labels.filter((l) => l.startsWith('worker:')).length);
  // Nothing to check against: the probe exists to catch a coverage command that
  // under-reports, and there is no command. Spending a suite run on it would prove nothing.
  eq('no-coverage: no coverage-truth agent is spawned', 0, bare.labels.filter((l) => l === 'coverage-truth').length);
  truthy('no-coverage: the skipped coverage-truth probe carries its reason into synthesis',
    bare.prompts.some((p) => /no conforming coverage-summary command/.test(p)));
  truthy('no-coverage: the absence reaches the report as not-checked',
    bare.ret.raw.not_checked.some((s) => /repository coverage report/.test(s)));
  // The worker must be told to measure rather than to look for a summary file that is
  // not there — a prompt that still points at coverage_summary.json would strand it.
  truthy('no-coverage: the worker prompt sends the agent to measure reachability directly',
    bare.prompts.some((p, i) => bare.labels[i].startsWith('worker:') && /No coverage report is available/.test(p)));
  truthy('no-coverage: the worker prompt does not point at a coverage summary that does not exist',
    !bare.prompts.some((p, i) => bare.labels[i].startsWith('worker:') && /coverage_summary\.json/.test(p)));
  // A guessed list of untested files would be read as measured. There is none to guess from.
  truthy('no-coverage: grouping is told to return an empty untested_churn rather than guess',
    bare.prompts.some((p, i) => bare.labels[i] === 'grouping' && /return an EMPTY array/.test(p)));

  // With a coverage report the hint is offered — as a ranking preference, never a filter.
  const withCoverage = await runAudit({ level: 'medium' });
  truthy('coverage present: the worker gets the summary as a ranking hint, not a filter',
    withCoverage.prompts.some((p, i) => withCoverage.labels[i].startsWith('worker:') &&
      /RANKING preference, never a filter/.test(p)));

  // ── the reachability probe ───────────────────────────────────────────────────
  // Every survivor costs one extra run, and that run is what makes the survivor readable.
  truthy('reachability: the worker is told to probe survivors and not killed mutants',
    withCoverage.prompts.some((p, i) => withCoverage.labels[i].startsWith('worker:') &&
      /one probe per SURVIVING mutant/.test(p) && /A KILLED mutant needs no probe/.test(p)));
  truthy('reachability: a green selector under a throw is reported as untested code, not a weak test',
    withCoverage.prompts.some((p, i) => withCoverage.labels[i].startsWith('worker:') &&
      /UNTESTED CODE, not a weak assertion/.test(p)));
  // A throw that will not compile, or one a broad catch could swallow, decides nothing.
  truthy('reachability: an undecidable probe is inconclusive rather than guessed',
    withCoverage.prompts.some((p, i) => withCoverage.labels[i].startsWith('worker:') &&
      /reached="inconclusive"/.test(p)));
  truthy('reachability: kill_rate excludes the sites no test reaches',
    withCoverage.prompts.some((p, i) => withCoverage.labels[i] === 'synthesis' &&
      /Survivors with reached="no" leave BOTH halves/.test(p)));

  // A perfect kill_rate over the few sites the tests DO reach is not strength.
  const mostlyUnreached = await runAudit({ level: 'medium' }, { __workerReached: 'no' });
  truthy('reachability: a suite that runs almost none of the probed code cannot be strong',
    mostlyUnreached.prompts.some((p, i) => mostlyUnreached.labels[i] === 'synthesis' &&
      /REACHABILITY CAP \(binding\)/.test(p)));
  truthy('reachability: the cap makes the headline give the share no test reaches',
    mostlyUnreached.prompts.some((p) => /share of mutation sites that no test reaches/.test(p)));
  // "probed" would read as survivors only, which is the smaller number: the same share
  // would then look larger than it is. The denominator is every mutation site.
  truthy('reachability: the cap names its denominator as mutation sites, not probes',
    mostlyUnreached.prompts.some((p) => /of the 1 mutation sites are run by NO test/.test(p)));
  truthy('reachability: a reached suite is not capped',
    !withCoverage.prompts.some((p) => /REACHABILITY CAP/.test(p)));
  eq('reachability: the measured counts are returned raw for the relay',
    { sites: 1, unreached: 1, inconclusive: 0, reached: 0 }, mostlyUnreached.ret.raw.reachability);

  // Refuting a proven-unreached survivor would spend an agent to argue away a measurement.
  const unreachedDeep = await runAudit({ level: 'ultra' }, { __workerReached: 'no' });
  eq('reachability: a proven-unreached survivor is not sent to the equivalent-mutant refuter',
    0, unreachedDeep.labels.filter((l) => l.startsWith('verify-mutant:')).length);

  // ── the audit-wide probes ────────────────────────────────────────────────────
  const declaredSplit = {
    ...healthyBaseline(),
    unit_split: {
      declared: true, unit_selector: 'make test-unit', source: 'CONTRIBUTING.md',
      external_env: ['DATABASE_URL'], deny_recipe: 'DATABASE_URL=postgres://127.0.0.1:1',
    },
  };
  const probed = await runAudit({ level: 'medium' }, { baseline: declaredSplit });
  eq('probes: the coverage-truth probe runs once for the whole audit, not once per component',
    1, probed.labels.filter((l) => l === 'coverage-truth').length);
  eq('probes: the denial probe runs once when the repo declares a unit split',
    1, probed.labels.filter((l) => l === 'denial').length);
  truthy('probes: the declared unit selector reaches the denial agent',
    probed.prompts.some((p) => p.includes('make test-unit')));
  // The cap is the whole point of the probe: kill_rate was measured on sites drawn from
  // coverage data this run just proved incomplete, so the top label is off the table.
  truthy('probes: a killed coverage-truth mutant caps the verdict below strong',
    probed.prompts.some((p) => /COVERAGE CAP \(binding\)/.test(p)));
  truthy('probes: the cap tells the headline to say the coverage source is unreliable',
    probed.prompts.some((p) => /coverage source is unreliable/.test(p)));

  eq('probes: level=low spawns neither audit-wide probe',
    0, (await runAudit({ level: 'low' })).labels.filter((l) => l === 'coverage-truth' || l === 'denial').length);

  // With no declared split the probe is skipped with a reason rather than guessed at from
  // file names — and the reason has to reach the report.
  const noSplit = await runAudit({ level: 'medium' });
  eq('probes: an undeclared unit split spawns no denial agent',
    0, noSplit.labels.filter((l) => l === 'denial').length);
  truthy('probes: the skipped denial probe carries its reason into the synthesis prompt',
    noSplit.prompts.some((p) => /declares no unit\/integration split/.test(p)));

  // The vacuous-probe regression, found by running this against two real repositories:
  // both declare a unit/integration split, and NEITHER routes an external dependency
  // through the environment (one reads only USER/PATH, the other runs entirely on
  // in-process fakes). A denied run there passes while denying nothing, and an empty
  // failures list would be reported as proven isolation. It must report NOT RUN instead.
  const nothingToDeny = await runAudit({ level: 'medium' }, {
    baseline: {
      ...healthyBaseline(),
      unit_split: { declared: true, unit_selector: 'go test ./...', source: 'docs/TESTING.md', external_env: [], deny_recipe: '' },
    },
  });
  eq('probes: a declared split with nothing to deny spawns no denial agent',
    0, nothingToDeny.labels.filter((l) => l === 'denial').length);
  truthy('probes: "nothing to deny" reaches the report as not-checked, not as clean isolation',
    nothingToDeny.prompts.some((p) => /nothing external to deny/.test(p)));
  // The distinction the report must preserve: no isolation finding may be inferred from
  // the absence of failures when the probe never ran.
  truthy('probes: the not-run reason states that a denied run would prove nothing',
    nothingToDeny.prompts.some((p) => /would prove nothing about isolation/.test(p)));

  // Each abort gate must produce a remediation report through the real pipeline, not crash.
  const redRun = await runAudit({ level: 'low' }, { baseline: { ...healthyBaseline(), green: false, red_details: 'test_x failed' } });
  eq('orchestration: a red baseline aborts with a remediation report', true, redRun.ret && redRun.ret.aborted);
  truthy('orchestration: the red abort names its reason',
    redRun.ret && /suite is red/.test(redRun.ret.abort_reason || ''));
  truthy('orchestration: the abort still returns a report object', redRun.ret && !!redRun.ret.report);
  eq('orchestration: an aborted run spawns no worker',
    0, redRun.labels.filter((l) => l.startsWith('worker:')).length);

  const slow = await runAudit({ level: 'low' }, { baseline: { ...healthyBaseline(), wall_s: 601, green: false } });
  truthy('orchestration: a timed-out baseline aborts as too slow, not as red (gate ordering)',
    slow.ret && /too slow/.test(slow.ret.abort_reason || ''), `got ${slow.ret && slow.ret.abort_reason}`);

  // ── broken-runtime guard ─────────────────────────────────────────────────────
  let threw = false;
  try {
    await load();
  } catch (err) {
    threw = /did not inject the .agent. hook/.test(String(err && err.message));
  }
  if (threw) ok('broken-runtime: missing agent hook fails loudly');
  else bad('broken-runtime: missing agent hook fails loudly', 'expected a throw');

  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.log(`FAIL: unexpected error — ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
