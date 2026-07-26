'use strict';
// test-review-docs.js — unit tests for the pure helpers in
// plugins/project-review/skills/project-review-docs/workflows/review-docs.js.
//
// review-docs.js is a Workflow-tool script: it begins with `export const meta` (ESM
// syntax) and uses top-level `await`/`return`, so stock require()/import() cannot load it.
// We strip the lone `export ` keyword and run the body inside an async-function wrapper —
// the same shape the Workflow runtime uses. The script assigns module.exports before its
// orchestration block, so the helpers are reachable whichever path that takes.
//
// Coverage:
//   - normalizeArgs parses a JSON-*string* args payload and rejects an unusable config
//     here rather than at the `python3 undefined/manifest.py` invocation
//   - the level vocabulary shared with project-review-codebase and test-tests, and the
//     level-to-route-budget mapping
//   - parseManifest survives the wrappings a model actually returns JSON in
//   - selectFileRoutes dedupes by target and caps without losing the pre-cap total
//   - the bad-args bailout returns the diagnostic error object without spawning agents
//   - a broken runtime (no agent hook) fails loudly instead of no-op

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = path.resolve(
  __dirname,
  '../../../plugins/project-review/skills/project-review-docs/workflows/review-docs.js'
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

  const { normalizeArgs, parseManifest, selectFileRoutes, LEVEL_ROUTES } = helpers;

  const required = { normalizeArgs, parseManifest, selectFileRoutes };
  const missingExport = Object.keys(required).filter((k) => typeof required[k] !== 'function');
  if (missingExport.length) {
    bad('review-docs.js exposes its pure helpers', `missing or not a function: ${missingExport.join(', ')}`);
    console.log(`\nResults: ${pass} passed, ${fail} failed`);
    process.exit(1);
  }
  ok('review-docs.js exposes its pure helpers');

  // ── normalizeArgs ────────────────────────────────────────────────────────────
  const good = normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts' });
  eq('normalizeArgs: a valid config carries no error', null, good.error);
  eq('normalizeArgs: level defaults to medium', 'medium', good.level);
  eq('normalizeArgs: the authoring rules resolve next to the scripts',
    '/s/references/project-doc-guidelines.md', good.guidelinesFile);
  eq('normalizeArgs: a trailing slash on scriptsDir still resolves the rules',
    '/s/references/project-doc-guidelines.md',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts/' }).guidelinesFile);

  // The regression the seam exists for: args arriving as a JSON STRING must be parsed,
  // or every field is undefined and the run dies at "undefined/manifest.py".
  eq('normalizeArgs: JSON-string payload is parsed (undefined-manifest regression guard)',
    '/parsed/root', normalizeArgs('{"repoRoot":"/parsed/root","scriptsDir":"/s/scripts"}').repoRoot);

  truthy('normalizeArgs: a missing repoRoot is rejected and named',
    /repoRoot/.test(normalizeArgs({ scriptsDir: '/s/scripts' }).error || ''));
  truthy('normalizeArgs: a missing scriptsDir is rejected and named',
    /scriptsDir/.test(normalizeArgs({ repoRoot: '/r' }).error || ''));
  truthy('normalizeArgs: non-JSON string is rejected', normalizeArgs('not json').error);
  truthy('normalizeArgs: undefined is rejected', normalizeArgs(undefined).error);

  // An unsubstituted "<SCRATCH>" placeholder is truthy and would slip past a bare falsy
  // check, then be created inside the repo the audit promised not to touch.
  truthy('normalizeArgs: a relative scratchDir is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts', scratchDir: '<SCRATCH>' }).error || ''));
  eq('normalizeArgs: an absolute scratchDir is accepted', null,
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts', scratchDir: '/tmp/x' }).error);

  // ── the shared level vocabulary and its route budget ─────────────────────────
  for (const lvl of ['low', 'medium', 'high', 'ultra']) {
    eq(`level: ${lvl} is accepted`, lvl, normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: lvl }).level);
  }
  eq('level: an unknown token falls back to medium', 'medium',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'turbo' }).level);
  eq('level: is case-insensitive', 'high',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'HIGH' }).level);

  const maxExecFor = (level) => normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level }).maxExec;
  eq('level: low runs no execution phase', 0, maxExecFor('low'));
  eq('level: medium caps the execution phase at 3 routes', 3, maxExecFor('medium'));
  eq('level: high runs every route', -1, maxExecFor('high'));
  eq('level: ultra runs every route, like high', -1, maxExecFor('ultra'));
  eq('level: the route budget table matches the documented rungs',
    { low: 0, medium: 3, high: -1, ultra: -1 }, LEVEL_ROUTES);

  // maxExecutionRoutes is the documented advanced override, including the value 0,
  // which a falsy-guard implementation would silently discard.
  eq('maxExecutionRoutes: overrides the level budget', 7,
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'medium', maxExecutionRoutes: 7 }).maxExec);
  eq('maxExecutionRoutes: an explicit 0 is honoured, not treated as unset', 0,
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'high', maxExecutionRoutes: 0 }).maxExec);

  // ── parseManifest ────────────────────────────────────────────────────────────
  eq('parseManifest: raw JSON', { a: 1 }, parseManifest('{"a":1}'));
  eq('parseManifest: surrounding whitespace', { a: 1 }, parseManifest('\n  {"a":1}\n '));
  eq('parseManifest: a ```json fence', { a: 1 }, parseManifest('```json\n{"a":1}\n```'));
  eq('parseManifest: a bare ``` fence', { a: 1 }, parseManifest('```\n{"a":1}\n```'));
  eq('parseManifest: prose before and after', { a: 1 },
    parseManifest('Here is the output:\n{"a":1}\nThat is all.'));
  eq('parseManifest: nested braces survive the outermost-brace slice',
    { a: { b: 2 } }, parseManifest('noise {"a":{"b":2}} noise'));

  let parseThrew = false;
  try { parseManifest('no json here at all'); } catch { parseThrew = true; }
  truthy('parseManifest: unparseable input throws so the run aborts loudly', parseThrew);

  // ── selectFileRoutes ─────────────────────────────────────────────────────────
  const routes = [
    { kind: 'file', target: 'docs/A.md' },
    { kind: 'skill', target: 'docs/SKILL.md' },   // skills are not doc routes
    { kind: 'file', target: 'docs/B.md' },
    { kind: 'file', target: 'docs/A.md' },        // duplicate target
    { kind: 'file', target: 'plugins/x' },        // not a .md
    { kind: 'file', target: 'docs/C.md' },
  ];
  const all = selectFileRoutes(routes, -1);
  eq('selectFileRoutes: dedupes by target and drops skills and non-.md targets',
    ['docs/A.md', 'docs/B.md', 'docs/C.md'], all.routes.map((r) => r.target));
  eq('selectFileRoutes: total counts the distinct routes', 3, all.total);

  const capped = selectFileRoutes(routes, 2);
  eq('selectFileRoutes: caps the routes it runs', 2, capped.routes.length);
  eq('selectFileRoutes: the pre-cap total survives capping, so the skip can be reported',
    3, capped.total);

  const none = selectFileRoutes(routes, 0);
  eq('selectFileRoutes: a budget of 0 runs nothing', 0, none.routes.length);
  eq('selectFileRoutes: a budget of 0 still reports what was skipped', 3, none.total);

  eq('selectFileRoutes: a cap above the total is not padded', 3, selectFileRoutes(routes, 99).routes.length);
  eq('selectFileRoutes: no routes at all', { routes: [], total: 0 }, selectFileRoutes([], -1));
  eq('selectFileRoutes: an absent routes list is tolerated', { routes: [], total: 0 },
    selectFileRoutes(undefined, -1));

  // ── bad-args bailout (orchestration) ─────────────────────────────────────────
  truthy('bailout: bad args return the diagnostic error object',
    ret && typeof ret.error === 'string' && /repoRoot/.test(ret.error),
    `got ${JSON.stringify(ret)}`);
  eq('bailout: the error object echoes the received args type', 'string', ret && ret.got && ret.got.type);
  if (!agentCalled) ok('bailout: no agent spawned on the bad-args path');
  else bad('bailout: no agent spawned on the bad-args path');

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
