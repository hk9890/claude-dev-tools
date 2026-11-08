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
//   - a fix agent works in a detached worktree and pushes to origin, so no local branch is left
//   - a failed fix gets a body written with its reason; a PR gets none
//   - a dead fix agent is recorded as failed, not dropped
//   - the match agent runs before the bodies; a match to a known earlier item replaces the
//     item's body, and a dead match agent files every item
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
    truthy('fix prompt counts a new file in the size limit', fix.includes('git diff --cached --numstat'));
    truthy('fix prompt applies a mutant that is not a patch by hand', /else make the same edit by hand/.test(fix));
    truthy('fix prompt commits only the test file', /Commit only your test file/.test(fix));
    eq('serial unless the args say otherwise', [true, false],
      [h.normalizeArgs(GOOD).serial, h.normalizeArgs({ ...GOOD, serial: false }).serial]);
    truthy('fix prompt writes the dedup line', fix.includes('dedup-key: <the item'));
    truthy('fix prompt makes no local branch',
      fix.includes('worktree add --detach /tmp/s/fix-2') && fix.includes('git push origin HEAD:refs/heads/<branch>') && !/ -b <branch>| -u origin/.test(fix));
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
    const { ret: noBody } = await load({ ...hooks(async (prompt, opts) => (opts.label.startsWith('fix') ? { status: 'failed', reason: 'red' } : { title: 't' })),
      args: { ...GOOD, fixes: [1], filed: [1], bodies: [] } });
    eq('no body for a failed fix of an already filed item', [], noBody.bodies);
    truthy('serial fixes run in order', prompts.filter((l) => l.startsWith('fix:')).join() === 'fix:1,fix:2,fix:3');
    truthy('no body for the fix that opened a PR', !prompts.includes('body:1'));

    const matchArgs = { ...GOOD, fixes: [], bodies: [4, 5, 6], match: [4, 5, 6], design: [6], earlier: { 't-a': false, 't-d': true } };
    const mcfg = h.normalizeArgs(matchArgs);
    const mp = h.matchPrompt(mcfg);
    truthy('match prompt names each new item and the earlier list',
      ['/tmp/s/triage/item-4.json', '/tmp/s/triage/item-6.json', '/tmp/s/triage/earlier.json'].every((p) => mp.includes(p)));
    truthy('match prompt keeps a design item apart from its finding', /a design question and the fix of the finding it names are two items/.test(mp));
    truthy('match prompt prefers a copy to a wrong match', /not sure, it is not a match/.test(mp));
    eq('a pair needs the same design side', [{ n: 6, id: 't-d' }],
      h.acceptMatches(mcfg, { matches: [{ n: 4, id: 't-d' }, { n: 6, id: 't-d' }, { n: 5, id: 't-x' }] })
        .filter((m) => m.n !== 4));
    eq('an earlier id two items claim matches neither', [],
      h.acceptMatches(mcfg, { matches: [{ n: 4, id: 't-a' }, { n: 5, id: 't-a' }] }));
    eq('an item not sent to the agent is never paired', [],
      h.acceptMatches(mcfg, { matches: [{ n: 9, id: 't-a' }] }));
    const matchLabels = [];
    const { ret: matched } = await load({ ...hooks(async (prompt, opts) => {
      matchLabels.push(opts.label);
      if (opts.label === 'match') return { matches: [{ n: 4, id: 't-a' }, { n: 5, id: 't-unknown' }] };
      return { title: `title ${opts.label}` };
    }), args: matchArgs });
    eq('a match to a known earlier item replaces its body', [{ n: 4, id: 't-a' }], matched.matches);
    eq('bodies for the items not matched', [5, 6], matched.bodies.map((b) => b.n));
    truthy('the match runs before any body', matchLabels[0] === 'match');
    const { ret: deadMatch } = await load({ ...hooks(async (prompt, opts) => (opts.label === 'match' ? null : { title: 't' })),
      args: matchArgs });
    eq('a dead match agent files every item', [4, 5, 6], deadMatch.bodies.map((b) => b.n));
    const { ret: thrown } = await load({ ...hooks(async (prompt, opts) => {
      if (opts.label === 'match') throw new Error('budget spent');
      return { title: 't' };
    }), args: matchArgs });
    eq('a match agent that throws files every item', [4, 5, 6], thrown.bodies.map((b) => b.n));
    const noMatchLabels = [];
    const { ret: none } = await load({ ...hooks(async (prompt, opts) => { noMatchLabels.push(opts.label); return { title: 't' }; }),
      args: { ...matchArgs, match: [], earlier: {} } });
    truthy('no match agent where the plan sends no item', !noMatchLabels.includes('match') && none.bodies.length === 3);

    truthy('missing agent hook throws', noHook && /did not inject/.test(noHook.message));
  } catch (e) {
    bad('test harness', e.stack);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
