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
//   - notCheckedList names every axis that did not run
//   - the grouping stage's uncovered_risk reaches synthesis (no worker carries it, so a
//     dropped hand-off would silently lose the audit's only account of untested code)
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

  const { normalizeArgs, dialFor, baselineAbort, scoreabilityAbort, notCheckedList, DIALS } = helpers;

  const required = { normalizeArgs, dialFor, baselineAbort, scoreabilityAbort, notCheckedList };
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

  // Pin the table itself against literals. Every other dial assertion compares the
  // subject's output to the subject's own table — `dialFor('ultra')` returns the very
  // object `DIALS.high` is, so both sides move together and a one-character edit to any
  // number here would change how many components are audited and how many mutants are
  // injected while all of them still passed.
  eq('dials: the documented rungs', {
    low: { components: 3, K: 3, M: 0, D: 0, R: 2, hermeticity: false, verify: false },
    medium: { components: 8, K: 5, M: 2, D: 1, R: 3, hermeticity: true, verify: false },
    high: { components: 12, K: 8, M: 3, D: 2, R: 5, hermeticity: true, verify: true },
  }, DIALS);

  eq('dials: low skips no-op and delay probes', [0, 0], [dialFor('low').M, dialFor('low').D]);
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

  const noCoverage = baselineAbort(
    { ...healthyBaseline(), coverage: { obtained: false, how_to_enable: 'add `make coverage`' } }, '/schema.md');
  truthy('baselineAbort: no coverage command aborts rather than mutating blind',
    noCoverage && /mutate blind/.test(noCoverage.reason));
  truthy('baselineAbort: the no-producer branch quotes how to enable coverage',
    noCoverage && noCoverage.evidence.includes('add `make coverage`'));
  truthy('baselineAbort: the no-producer branch tells the user to add the command',
    noCoverage && /Add and document that command/.test(noCoverage.remediation));

  const badCoverage = baselineAbort(
    { ...healthyBaseline(), coverage: { obtained: false, producer_cmd: 'make cov', validation_errors: 'line 3: bad range' } },
    '/schema.md');
  truthy('baselineAbort: a rejected coverage payload quotes the validator errors',
    badCoverage && badCoverage.evidence.includes('line 3: bad range'));
  truthy('baselineAbort: the rejected-payload branch tells the user to fix the command',
    badCoverage && /Fix the command so its output conforms/.test(badCoverage.remediation));
  truthy('baselineAbort: the coverage abort cites the schema reference it was given',
    badCoverage && badCoverage.remediation.includes('/schema.md'));

  // obtained=true with no summary file is the same blind-mutation hazard.
  truthy('baselineAbort: obtained=true without a summary file still aborts',
    baselineAbort({ ...healthyBaseline(), coverage: { obtained: true, producer_cmd: 'make cov' } }, '/s.md'));

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

  // ── notCheckedList ───────────────────────────────────────────────────────────
  const baseNotChecked = {
    level: 'low',
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
  truthy('notCheckedList: warns that worktree mode audits HEAD, not the dirty tree',
    has('uncommitted working-tree changes'));

  truthy('notCheckedList: silence about uncovered risk is disclaimed, not implied',
    has('uncovered-risk'));

  const fullHigh = {
    ...baseNotChecked,
    level: 'high',
    baseline: healthyBaseline(),
    components: [{ name: 'core', uncovered_risk: [{ file: 'a', lines: '1-2', behavior: 'b', risk: 'r' }] }],
    skippedComponents: [],
    mode: 'worktree',
  };
  eq('notCheckedList: a full high run with a shuffle flag has nothing to disclaim', [],
    notCheckedList(fullHigh));
  // An axis that produced no finding and an axis nobody looked at read identically in a
  // report. Only the second belongs on the not-checked list, so the disclosure keys off
  // whether the grouping stage filled the field at all.
  eq('notCheckedList: a run whose components report no uncovered risk says so', 1,
    notCheckedList({ ...fullHigh, components: [{ name: 'core', uncovered_risk: [] }] }).length);
  truthy('notCheckedList: a worker that died is named',
    notCheckedList({ ...baseNotChecked, level: 'high', baseline: healthyBaseline(), skippedComponents: [], workerResults: [null] })
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
        return {
          components: [{
            name: 'core', prod_paths: ['src/a.js'], test_selector: 'make test',
            uncovered_risk: [{
              file: 'src/a.js', lines: '40-58', behavior: 'retries the upstream call',
              risk: 'a retry storm would ship undetected',
            }],
          }],
        };
      }
      if (opts.label.startsWith('worker:')) {
        if (agentOver.worker !== undefined) return agentOver.worker;
        return {
          component: 'core', audited: true, integrity_ok: true,
          mutants: [{ file: 'src/a.js', line: 1, diff: 'd', stated_behavior_change: 'b', outcome: 'SURVIVED' }],
          noops: [], delays: [], flakes: [],
        };
      }
      if (opts.label.startsWith('verify-mutant:')) return agentOver.verifyMutant || { refuted: false };
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
  // uncovered_risk is grouping-stage judgement, so it reaches the report ONLY through the
  // synthesis prompt — no worker record carries it. Every mutation probe runs on covered
  // lines, which makes this the audit's only account of code no test reaches: drop the
  // hand-off and the report goes quiet about it while still reading as complete.
  truthy('orchestration: the grouping stage\'s uncovered risk reaches synthesis',
    deep.prompts.some((p) => p.includes('UNCOVERED RISK') && p.includes('retry storm')));
  truthy('orchestration: the uncovered-risk block says the mutation probes never ran there',
    deep.prompts.some((p) => /UNCOVERED RISK[\s\S]*COVERED lines only/.test(p)));

  const shallow = await runAudit({ level: 'medium' });
  eq('orchestration: below high nothing is verified',
    0, shallow.labels.filter((l) => l.startsWith('verify-mutant:')).length);
  eq('orchestration: the shallow run still reports', 'adequate',
    shallow.ret && shallow.ret.report && shallow.ret.report.verdict);

  // The janitor is the ONLY code that restores a user's uncommitted work after a worker
  // dies mid-mutation in live-tree mode. Both of its triggers — a worker that returns a
  // record failing its integrity gate, and one that dies outright — were unreachable while
  // the stub could only succeed, so a dropped await or a wrong backup index would have been
  // invisible while every assertion still passed.
  const brokenIntegrity = await runAudit({ level: 'medium' }, {
    worker: {
      component: 'core', audited: true, integrity_ok: false,
      mutants: [{ file: 'src/a.js', line: 1, diff: 'd', stated_behavior_change: 'b', outcome: 'SURVIVED' }],
      noops: [], delays: [], flakes: [],
    },
  });
  eq('orchestration: a failed integrity gate summons the janitor',
    1, brokenIntegrity.labels.filter((l) => l === 'janitor:core').length);
  truthy('orchestration: the janitor is told which failure it is cleaning up',
    brokenIntegrity.prompts.some((p) => /failed its integrity gate/.test(p)));

  const deadWorker = await runAudit({ level: 'medium' }, { worker: null });
  eq('orchestration: a dead worker summons the janitor',
    1, deadWorker.labels.filter((l) => l === 'janitor:core').length);
  truthy('orchestration: a dead worker aborts rather than scoring nothing',
    deadWorker.ret && deadWorker.ret.aborted);

  // Refutation is what separates high/ultra from medium, and its job is to REMOVE a
  // finding. The all-survive stub proved only that verify agents were spawned: an inverted
  // filter, or a drop applied to a copy, would keep every refuted mutant and stay green.
  // The flake keeps another axis populated so the run reaches synthesis instead of tripping
  // the scoreability gate once the only mutant is gone.
  const dropped = await runAudit({ level: 'ultra' }, {
    worker: {
      component: 'core', audited: true, integrity_ok: true,
      mutants: [{ file: 'src/a.js', line: 1, diff: 'd', stated_behavior_change: 'b', outcome: 'SURVIVED' }],
      noops: [], delays: [], flakes: [{ test: 't', symptom: 's' }],
    },
    verifyMutant: { refuted: true, reason: 'equivalent' },
  });
  const droppedWorker = dropped.ret && dropped.ret.raw && dropped.ret.raw.workers[0];
  eq('orchestration: a refuted mutant is removed from the worker record',
    0, droppedWorker && droppedWorker.mutants.length);
  truthy('orchestration: the drop is recorded in the worker notes with its reason',
    droppedWorker && /dropped equivalent mutant src\/a\.js:1 — equivalent/.test(droppedWorker.notes || ''),
    `got notes ${JSON.stringify(droppedWorker && droppedWorker.notes)}`);
  truthy('orchestration: the run still reports once its only mutant is refuted',
    dropped.ret && dropped.ret.report && !dropped.ret.aborted);

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
