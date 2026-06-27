'use strict';
// test-work.js — unit tests for the pure helpers in plugins/tasks/workflows/work.js.
//
// work.js is a Workflow-tool script: it begins with `export const meta` (ESM syntax)
// and uses top-level `await`/`return`, so stock require()/import() cannot load it. We
// strip the lone `export ` keyword and run the body inside an async-function wrapper —
// the same shape the Workflow runtime uses. The orchestration self-guards on
// `typeof agent === 'function'`, so:
//   - loadWork()                 → no `agent` global → orchestration skipped, helpers exported
//   - loadWork({ agent, ... })   → `agent` present  → orchestration runs, its return captured
//
// Coverage (the regressions the work.js comments document):
//   - normalizeArgs parses a JSON-*string* args payload (the silent no-op bug)
//   - normalizeArgs returns empty taskIds for absent/garbage input
//   - the empty-taskIds bailout returns the diagnostic error object without spawning agents
//   - summarizeActions buckets per-task records by their recorded action
//   - the reviewer-absent throw is caught and falls back to the general-purpose agent
//   - a broken runtime (no agent hook, no test sentinel) fails loudly instead of no-op

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WORK_JS = path.resolve(__dirname, '../../../plugins/tasks/workflows/work.js');

// Load work.js in a sandbox. `globals` supplies workflow-runtime hooks; pass none to
// load only the exported pure helpers. By default a __WORK_TEST__ sentinel is injected so
// work.js knows it is loaded for testing (and skips its orchestration without throwing);
// pass { sentinel: false } to simulate a broken runtime (no hooks, no sentinel), which
// work.js must reject loudly. Returns { exports, ret } where ret is the value the
// orchestration returned (undefined when it was skipped).
async function loadWork(globals = {}, { sentinel = true } = {}) {
  const src = fs.readFileSync(WORK_JS, 'utf8').replace(/^export const meta/m, 'const meta');
  const moduleObj = { exports: {} };
  const merged = sentinel ? { __WORK_TEST__: true, ...globals } : { ...globals };
  const names = Object.keys(merged);
  const wrapper = `(async function(module, exports${names.length ? ', ' + names.join(', ') : ''}) {\n${src}\n})`;
  const fn = vm.runInThisContext(wrapper, { filename: WORK_JS });
  const ret = await fn(moduleObj, moduleObj.exports, ...names.map((n) => merged[n]));
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

async function main() {
  // ── normalizeArgs ──────────────────────────────────────────────────────────
  const { normalizeArgs, summarizeActions } = (await loadWork()).exports;

  if (typeof normalizeArgs !== 'function' || typeof summarizeActions !== 'function') {
    bad('work.js exports normalizeArgs and summarizeActions',
      `got ${typeof normalizeArgs} / ${typeof summarizeActions}`);
    return;
  }
  ok('work.js exports normalizeArgs and summarizeActions');

  eq('normalizeArgs: parsed object passes through',
    { taskIds: ['a', 'b'], epicId: 'E1' },
    normalizeArgs({ taskIds: ['a', 'b'], epicId: 'E1' }));

  // The documented silent-no-op regression: args arriving as a JSON STRING must be
  // parsed so taskIds is populated (a naive `.taskIds` read would be undefined → no-op).
  eq('normalizeArgs: JSON-string payload is parsed (no-op regression guard)',
    { taskIds: ['a', 'b'], epicId: null },
    normalizeArgs('{"taskIds":["a","b"]}'));

  eq('normalizeArgs: JSON-string payload carries epicId',
    { taskIds: ['x'], epicId: 'E9' },
    normalizeArgs('{"taskIds":["x"],"epicId":"E9"}'));

  eq('normalizeArgs: non-JSON string → empty',
    { taskIds: [], epicId: null }, normalizeArgs('not json at all'));
  eq('normalizeArgs: undefined → empty',
    { taskIds: [], epicId: null }, normalizeArgs(undefined));
  eq('normalizeArgs: null → empty',
    { taskIds: [], epicId: null }, normalizeArgs(null));
  eq('normalizeArgs: empty object → empty',
    { taskIds: [], epicId: null }, normalizeArgs({}));
  eq('normalizeArgs: object with empty taskIds → empty',
    { taskIds: [], epicId: null }, normalizeArgs({ taskIds: [] }));

  // ── summarizeActions ─────────────────────────────────────────────────────────
  const perTask = [
    { taskId: 't1', record: { action: 'closed' } },
    { taskId: 't2', record: { action: 'left-open' } },
    { taskId: 't3', record: { action: 'closed' } },
    { taskId: 't4', record: { action: 'inconclusive' } },
    { taskId: 't5', record: { action: 'skipped' } },
    { taskId: 't6', record: null },        // defensive: missing record is ignored
    null,                                   // defensive: dropped result is ignored
  ];
  eq('summarizeActions: buckets per recorded action',
    { closed: ['t1', 't3'], left_open: ['t2'], inconclusive: ['t4'], skipped: ['t5'] },
    summarizeActions(perTask));

  eq('summarizeActions: empty input → empty buckets',
    { closed: [], left_open: [], inconclusive: [], skipped: [] },
    summarizeActions([]));

  // ── empty-taskIds bailout (orchestration) ─────────────────────────────────────
  // Run the orchestration with an `agent` present (so the runtime guard fires) but
  // empty taskIds. It must return the diagnostic error object and must NOT spawn agents.
  let agentCalled = false;
  const throwIfCalled = (name) => () => { throw new Error(`${name} must not be called on the empty-taskIds path`); };
  const { ret } = await loadWork({
    agent: () => { agentCalled = true; throw new Error('agent must not be called on the empty-taskIds path'); },
    args: '{}',                 // a JSON string with no taskIds
    log: () => {},
    phase: throwIfCalled('phase'),
    parallel: throwIfCalled('parallel'),
  });

  if (ret && typeof ret.error === 'string' && /No taskIds provided/.test(ret.error)) {
    ok('bailout: empty taskIds returns the diagnostic error object');
  } else {
    bad('bailout: empty taskIds returns the diagnostic error object', `got ${JSON.stringify(ret)}`);
  }
  eq('bailout: error object echoes the received args type', 'string', ret && ret.received && ret.received.type);
  if (!agentCalled) ok('bailout: no agent spawned on the empty-taskIds path');
  else bad('bailout: no agent spawned on the empty-taskIds path');

  // ── orchestration: one task, happy path + reviewer-absent fallback ───────────
  // Drives the full implement → review∥test → record pipeline through stubbed hooks.
  // `reviewerPresent:false` makes the project-quality reviewer agentType THROW, which
  // must trigger runReview's general-purpose fallback (not strand the task) — the
  // throw-vs-null safety the work.js comments call out as highest-risk.
  const runOneTask = async (reviewerPresent) => {
    const calls = { generalPurposeReview: false };
    const agent = async (_prompt, opts = {}) => {
      const { agentType, label = '' } = opts;
      if (agentType === 'tasks:implementer') return { status: 'implemented', changedFiles: [], summary: 'did x' };
      if (agentType === 'project-quality:project-reviewer') {
        if (!reviewerPresent) throw new Error('unknown agentType: project-quality:project-reviewer');
        return { verdict: 'ok' };
      }
      if (agentType === 'general-purpose') { calls.generalPurposeReview = true; return { verdict: 'ok' }; }
      if (agentType === 'tasks:verifier' && label.startsWith('test:')) return { pass: true };
      if (agentType === 'tasks:verifier' && label.startsWith('record:')) return { action: 'closed', taskId: 't1' };
      throw new Error(`unexpected agent call: ${agentType} / ${label}`);
    };
    const { ret } = await loadWork({
      agent,
      args: { taskIds: ['t1'] },
      log: () => {},
      phase: () => {},
      parallel: async (thunks) => Promise.all(thunks.map((t) => t())),
    });
    return { ret, calls };
  };

  const happy = await runOneTask(true);
  eq('orchestration: passing task is recorded closed', ['t1'], happy.ret && happy.ret.closed);
  eq('orchestration: summary counts the close', 1, happy.ret && happy.ret.summary && happy.ret.summary.closed);

  const fallback = await runOneTask(false);
  eq('fallback: task still closes when project-quality reviewer is absent',
    ['t1'], fallback.ret && fallback.ret.closed);
  if (fallback.calls.generalPurposeReview) ok('fallback: review ran on the general-purpose agent');
  else bad('fallback: review ran on the general-purpose agent', 'general-purpose reviewer was not used');

  // ── broken-runtime guard ─────────────────────────────────────────────────────
  // No `agent` hook AND no test sentinel → work.js must throw, not silently return undefined
  // (which the harness would record as a successful no-op). This pins the loud-fail behavior.
  let threw = false;
  try {
    await loadWork({}, { sentinel: false });
  } catch (err) {
    threw = /did not inject the .agent. hook/.test(String(err && err.message));
  }
  if (threw) ok('broken-runtime: missing agent hook (no sentinel) fails loudly');
  else bad('broken-runtime: missing agent hook (no sentinel) fails loudly', 'expected a throw');

  // ── summary ────────────────────────────────────────────────────────────────
  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.log(`FAIL: unexpected error — ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
