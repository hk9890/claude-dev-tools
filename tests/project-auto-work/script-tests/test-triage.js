'use strict';
// test-triage.js — unit tests for plugins/project-auto-work/workflows/triage.js.
//
// Loads the Workflow script the way test-test-tests.js does (strip `export`, run the body
// in an async wrapper) and drives its orchestration with stub agent/pipeline/parallel
// hooks, so no agent is spawned.
//
// Coverage:
//   - normalizeArgs rejects relative paths, an unknown tool, and fixes for test-app
//   - each fix agent's prompt names its own item and worktree, the proving check and the
//     never-merge rule
//   - a failed fix gets a body written with its reason; a PR gets none
//   - a dead fix agent is recorded as failed, not dropped
//   - a broken runtime (no agent hook) fails loudly

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = path.resolve(__dirname, '../../../plugins/project-auto-work/workflows/triage.js');

async function load(globals = {}) {
  const src = fs.readFileSync(SCRIPT, 'utf8').replace(/^export const meta/m, 'const meta');
  const moduleObj = { exports: {} };
  const names = Object.keys(globals);
  const wrapper = `(async function(module, exports${names.length ? ', ' + names.join(', ') : ''}) {\n${src}\n})`;
  const fn = vm.runInThisContext(wrapper, { filename: SCRIPT });
  try {
    const ret = await fn(moduleObj, moduleObj.exports, ...names.map((n) => globals[n]));
    return { exports: moduleObj.exports, ret };
  } catch (error) {
    return { exports: moduleObj.exports, error };
  }
}

let pass = 0;
let fail = 0;
function ok(label) { console.log(`PASS: ${label}`); pass += 1; }
function bad(label, detail) { console.log(`FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail += 1; }
function eq(label, expected, actual) {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  if (e === a) ok(label); else bad(label, `expected ${e}, got ${a}`);
}
function truthy(label, value, detail) { if (value) ok(label); else bad(label, detail); }

const GOOD = { repoRoot: '/repo', scratchDir: '/tmp/s', planDir: '/tmp/s/triage', tool: 'test-tests', fixes: [1, 2, 3], bodies: [4] };

// Workflow hooks: pipeline runs each item through its stages, parallel runs the thunks.
const hooks = (agentImpl) => ({
  agent: agentImpl,
  args: GOOD,
  log: () => {},
  phase: () => {},
  parallel: (thunks) => Promise.all(thunks.map((t) => t().catch(() => null))),
  pipeline: (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let value = item;
    for (const [s, stage] of stages.entries()) value = await stage(s === 0 ? item : value, item, i);
    return value;
  })),
});

(async () => {
  try {
    const { exports: h, error: noHook } = await load();
    eq('valid args', null, h.normalizeArgs(GOOD).error);
    eq('string args parsed', [1, 2, 3], h.normalizeArgs(JSON.stringify(GOOD)).fixes);
    truthy('relative planDir rejected', /planDir must be an absolute path/.test(h.normalizeArgs({ ...GOOD, planDir: '<plan>' }).error));
    truthy('unknown tool rejected', /tool must be/.test(h.normalizeArgs({ ...GOOD, tool: 'x' }).error));
    truthy('test-app fixes rejected', /never fixed unattended/.test(h.normalizeArgs({ ...GOOD, tool: 'test-app' }).error));
    eq('non-integer item numbers dropped', [2], h.normalizeArgs({ ...GOOD, fixes: [0, 'x', 2] }).fixes);

    const cfg = h.normalizeArgs(GOOD);
    const fix = h.fixPrompt(cfg, 2);
    truthy('fix prompt names its item', fix.includes('/tmp/s/triage/item-2.json'));
    truthy('fix prompt names its worktree', fix.includes('/tmp/s/fix-2'));
    truthy('fix prompt demands the mutant fail the suite', /it MUST fail/.test(fix));
    truthy('fix prompt forbids merging', /Never merge the PR/.test(fix));
    truthy('fix prompt forbids skipping tests', /never skip, disable, quarantine/.test(fix));
    truthy('fix prompt writes the dedup line', fix.includes('dedup-key: <the item'));
    truthy('body prompt carries the failure', h.bodyPrompt(cfg, 3, 'mutant still survives').includes('mutant still survives'));
    truthy('body prompt writes the dedup line', h.bodyPrompt(cfg, 3).includes('dedup-key: <the item'));

    const prompts = [];
    const { ret } = await load(hooks(async (prompt, opts) => {
      prompts.push(opts.label);
      if (opts.label === 'fix:1') return { status: 'pr', url: 'https://pr/1', branch: 'b' };
      if (opts.label === 'fix:2') return { status: 'failed', reason: 'mutant still survives' };
      if (opts.label === 'fix:3') return null;
      return { title: `title ${opts.label}` };
    }));
    eq('fix outcomes', [
      { n: 1, status: 'pr', url: 'https://pr/1', branch: 'b' },
      { n: 2, status: 'failed', reason: 'mutant still survives' },
      { n: 3, status: 'failed', reason: 'the fix agent returned nothing' },
    ], ret.fixes);
    eq('bodies for the item to file and each failed fix', [4, 2, 3], ret.bodies.map((b) => b.n));
    truthy('no body for the fix that opened a PR', !prompts.includes('body:1'));

    truthy('missing agent hook throws', noHook && /did not inject/.test(noHook.message));
  } catch (e) {
    bad('test harness', e.stack);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
