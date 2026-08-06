'use strict';
// test-review-codebase.js — unit tests for the pure helpers in
// plugins/project-review/skills/project-review-codebase/workflows/review-codebase.js.
//
// review-codebase.js is a Workflow-tool script: it begins with `export const meta` (ESM
// syntax) and uses top-level `await`/`return`, so stock require()/import() cannot load it.
// We strip the lone `export ` keyword and run the body inside an async-function wrapper —
// the same shape the Workflow runtime uses. The script assigns module.exports before its
// orchestration block, so:
//   - load({ agent, ... })  → `agent` present → orchestration runs, its return captured,
//                             and the helpers are on .exports either way
//   - load()                → no `agent` global → the script throws (the loud-fail guard)
//
// Coverage:
//   - normalizeArgs parses a JSON-*string* args payload (the silent-wrong-repo regression)
//   - a missing repoRoot is rejected here rather than reaching the dimension prompts
//   - the level vocabulary shared with project-review-docs and test-tests
//   - dimensionSchema keeps one required core across all three dimensions
//   - the vocabulary file appears in the architecture procedure only when supplied
//   - missingDimensions detects a dimension agent that never came back
//   - the bad-args bailout returns the diagnostic error object without spawning agents
//   - a broken runtime (no agent hook) fails loudly instead of no-op

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = path.resolve(
  __dirname,
  '../../../plugins/project-review/skills/project-review-codebase/workflows/review-codebase.js'
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
  // One load serves both the helper tests and the bailout assertions: `agent` is present
  // so the runtime guard passes, but args carry no repoRoot, so the orchestration bails
  // out before spawning anything.
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

  const { normalizeArgs, dimensionSchema, buildDimensions, dimensionPrompt, missingDimensions, scopeLine } = helpers;

  const required = { normalizeArgs, dimensionSchema, buildDimensions, dimensionPrompt, missingDimensions, scopeLine };
  const missingExport = Object.keys(required).filter((k) => typeof required[k] !== 'function');
  if (missingExport.length) {
    bad('review-codebase.js exposes its pure helpers', `missing or not a function: ${missingExport.join(', ')}`);
    console.log(`\nResults: ${pass} passed, ${fail} failed`);
    process.exit(1);
  }
  ok('review-codebase.js exposes its pure helpers');

  // ── normalizeArgs ────────────────────────────────────────────────────────────
  eq('normalizeArgs: parsed object passes through',
    {
      repoRoot: '/r', scope: 'the api layer', vocabFile: '/v.md', level: 'medium', ultra: false,
      reviewModel: 'opus', receivedKeys: ['repoRoot', 'scope', 'vocabFile'], error: null,
    },
    normalizeArgs({ repoRoot: '/r', scope: 'the api layer', vocabFile: '/v.md' }));

  // The depth vocabulary is shared with project-review-docs, and it used to be shared in
  // name only: low/medium/high ran identically here, so `low` cost the same as `high` and
  // the skill had to warn users about its own argument. `low` now means what it means
  // there — the reviewing agents drop to sonnet.
  const modelFor = (level) => normalizeArgs({ repoRoot: '/r', level }).reviewModel;
  eq('level: low reviews on sonnet, the cheap rung users expect', 'sonnet', modelFor('low'));
  for (const lvl of ['medium', 'high', 'ultra']) {
    eq(`level: ${lvl} reviews on opus`, 'opus', modelFor(lvl));
  }

  // The regression the seam exists for: args arriving as a JSON STRING must be parsed.
  // A naive `.repoRoot` read would be undefined, and the dimension prompts would ship the
  // literal "undefined" as the repo root — three agents reviewing the wrong tree.
  eq('normalizeArgs: JSON-string payload is parsed (wrong-repo regression guard)',
    '/parsed/root', normalizeArgs('{"repoRoot":"/parsed/root"}').repoRoot);

  eq('normalizeArgs: JSON-string payload carries the level',
    'ultra', normalizeArgs('{"repoRoot":"/r","level":"ultra"}').level);

  truthy('normalizeArgs: non-JSON string is rejected, not interpolated',
    normalizeArgs('not json at all').error);
  truthy('normalizeArgs: undefined is rejected', normalizeArgs(undefined).error);
  truthy('normalizeArgs: null is rejected', normalizeArgs(null).error);
  truthy('normalizeArgs: empty object is rejected', normalizeArgs({}).error);
  truthy('normalizeArgs: missing repoRoot names the missing arg',
    /repoRoot/.test(normalizeArgs({ scope: 'x' }).error || ''));
  eq('normalizeArgs: a valid config carries no error', null, normalizeArgs({ repoRoot: '/r' }).error);

  // An unsubstituted "<…>" placeholder from the SKILL.md args template is a non-empty
  // string, so a truthiness check passes it through and three opus agents review whatever
  // tree they land in — exactly what this validation exists to stop.
  truthy('normalizeArgs: an unsubstituted placeholder repoRoot is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: '<repo root, or the step-1 path>' }).error || ''));
  truthy('normalizeArgs: a relative repoRoot is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: 'some/dir' }).error || ''));

  // The old boolean contract must fail loudly rather than silently running at medium.
  truthy('normalizeArgs: the retired boolean `ultra` argument is rejected, not ignored',
    /level/.test(normalizeArgs({ repoRoot: '/r', ultra: true }).error || ''));
  truthy('normalizeArgs: even ultra:false is rejected rather than silently accepted',
    normalizeArgs({ repoRoot: '/r', ultra: false }).error);

  // A caller who misspells a key needs to see what actually arrived; an error naming only
  // the expected keys cannot show that.
  eq('normalizeArgs: the received keys are echoed for diagnosis',
    ['repoRoot', 'scopr'], normalizeArgs({ repoRoot: '<x>', scopr: 'typo' }).receivedKeys);

  // ── the shared level vocabulary ──────────────────────────────────────────────
  eq('level: defaults to medium', 'medium', normalizeArgs({ repoRoot: '/r' }).level);
  eq('level: an unknown token falls back to medium', 'medium',
    normalizeArgs({ repoRoot: '/r', level: 'turbo' }).level);
  eq('level: is case-insensitive', 'ultra', normalizeArgs({ repoRoot: '/r', level: 'ULTRA' }).level);
  for (const lvl of ['low', 'medium', 'high', 'ultra']) {
    eq(`level: ${lvl} is accepted`, lvl, normalizeArgs({ repoRoot: '/r', level: lvl }).level);
  }
  // Only ultra changes what this workflow does — the other rungs share one code path.
  eq('level: only ultra sets the refutation flag',
    [false, false, false, true],
    ['low', 'medium', 'high', 'ultra'].map((l) => normalizeArgs({ repoRoot: '/r', level: l }).ultra));

  // ── dimensionSchema ──────────────────────────────────────────────────────────
  const base = dimensionSchema();
  eq('dimensionSchema: core required fields', ['dimension', 'verdict', 'findings'], base.required);
  truthy('dimensionSchema: findings carry evidence and why_it_matters',
    base.properties.findings.items.required.includes('evidence') &&
    base.properties.findings.items.required.includes('why_it_matters'));
  const withTree = dimensionSchema({ tree_mermaid: { type: 'string' } });
  truthy('dimensionSchema: an extra property is merged in', !!withTree.properties.tree_mermaid);
  eq('dimensionSchema: an extra property does not change the required core',
    base.required, withTree.required);

  // ── buildDimensions / dimensionPrompt ────────────────────────────────────────
  const dims = buildDimensions('');
  eq('buildDimensions: three dimensions in review order',
    ['consistency', 'structure', 'architecture'], dims.map((d) => d.key));

  const arch = (v) => buildDimensions(v).find((d) => d.key === 'architecture').procedure;
  truthy('buildDimensions: the vocabulary file is cited when supplied',
    arch('/design-vocabulary.md').includes('/design-vocabulary.md'));
  truthy('buildDimensions: no dangling vocabulary sentence when it is absent',
    !/design vocabulary at/.test(arch('')));

  // The churn weighting is a prompt invariant. Without it the architecture agent walks the
  // tree evenly and proposes deepenings in code nobody edits; without the blank-line filter
  // its ranking is topped by git log's empty separator lines. The findings exemption is this
  // repo's departure from the upstream YAGNI filter and has to survive an edit to the block.
  truthy('buildDimensions: architecture weights its walk by churn',
    /WEIGHT YOUR ATTENTION BY CHURN/.test(arch('')));
  truthy('buildDimensions: the churn ranking drops the blank separator lines',
    arch('').includes("grep -v '^$'"));
  truthy('buildDimensions: findings stay exempt from the churn weighting',
    /FINDINGS are exempt/.test(arch('')));

  const cfg = { repoRoot: '/repo', scope: '' };
  const structurePrompt = dimensionPrompt(dims.find((d) => d.key === 'structure'), cfg);
  truthy('dimensionPrompt: carries the repo root', structurePrompt.includes('Repo root: /repo'));
  truthy('dimensionPrompt: structure is asked for tree_mermaid',
    structurePrompt.includes('Also return tree_mermaid'));
  truthy('dimensionPrompt: consistency is not asked for tree_mermaid',
    !dimensionPrompt(dims[0], cfg).includes('Also return tree_mermaid'));
  truthy('dimensionPrompt: architecture is asked for candidates',
    dimensionPrompt(dims[2], cfg).includes('Also return candidates'));

  // The classDef names are a cross-plugin contract with html-visualization's
  // visualize-template.html, which colours each one. A rename here silently degrades
  // every rendered report to structure-only marks.
  const marks = ['misplaced', 'dead', 'god', 'leak', 'deep'];
  const allProcedures = dims.map((d) => d.procedure).join('\n');
  const missingMarks = marks.filter((m) => !allProcedures.includes(`classDef ${m} `));
  eq('dimension procedures: the Mermaid mark vocabulary is intact', [], missingMarks);

  // ── scopeLine ────────────────────────────────────────────────────────────────
  truthy('scopeLine: an empty scope means the whole tree',
    scopeLine('').includes('the whole codebase'));
  truthy('scopeLine: a supplied scope is quoted back and confines the findings',
    scopeLine('the api layer').includes('the api layer') && scopeLine('the api layer').includes('Confine'));

  // ── missingDimensions ────────────────────────────────────────────────────────
  const keys = ['consistency', 'structure', 'architecture'];
  eq('missingDimensions: none missing when all three returned', [],
    missingDimensions([{ dimension: 'consistency' }, { dimension: 'structure' }, { dimension: 'architecture' }], keys));
  eq('missingDimensions: names the dimension that died', ['structure'],
    missingDimensions([{ dimension: 'consistency' }, { dimension: 'architecture' }], keys));
  eq('missingDimensions: a null result counts as missing', keys, missingDimensions([null], keys));
  eq('missingDimensions: no reviews at all means all missing', keys, missingDimensions([], keys));

  // ── bad-args bailout (orchestration) ─────────────────────────────────────────
  truthy('bailout: bad args return the diagnostic error object',
    ret && typeof ret.error === 'string' && /repoRoot/.test(ret.error),
    `got ${JSON.stringify(ret)}`);
  eq('bailout: the error object echoes the received args type', 'string', ret && ret.got && ret.got.type);
  if (!agentCalled) ok('bailout: no agent spawned on the bad-args path');
  else bad('bailout: no agent spawned on the bad-args path');

  // ── orchestration ────────────────────────────────────────────────────────────
  // Drive the FULL review → (ultra) refute → synthesis pipeline through stubbed hooks.
  // The helper assertions above all reach their functions directly, so without this the
  // orchestration block — the code the seam was added for — would never execute: a
  // variable dropped from its destructure throws a ReferenceError only on the first
  // agent call, and every assertion above would still pass.
  const runReview = async (level) => {
    const labels = [];
    const prompts = [];
    const agent = async (prompt, opts = {}) => {
      labels.push(opts.label);
      prompts.push(prompt);
      if (opts.label.startsWith('review:')) {
        return {
          dimension: opts.label.split(':')[1],
          verdict: 'minor issues',
          findings: [{
            severity: 'major', location: 'a.js:1', observation: 'o',
            evidence: 'e', why_it_matters: 'w', recommended_action: 'r',
          }],
        };
      }
      if (opts.label.startsWith('verify:')) return { refuted: false, reason: '' };
      return {
        verdict: 'minor issues', headline: 'h', findings: [],
        recommended_actions: [], report_markdown: '# report',
      };
    };
    const { ret } = await load({
      agent,
      args: { repoRoot: '/repo', scope: 'the api layer', vocabFile: '/v.md', level },
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

  const deep = await runReview('ultra');
  eq('orchestration: one review agent per dimension',
    ['review:consistency', 'review:structure', 'review:architecture'],
    deep.labels.filter((l) => l.startsWith('review:')));
  eq('orchestration: ultra refutes every finding', 3, deep.labels.filter((l) => l.startsWith('verify:')).length);
  eq('orchestration: the report is returned', '# report', deep.ret && deep.ret.report && deep.ret.report.report_markdown);
  eq('orchestration: the raw dimension results are carried out', 3, deep.ret && deep.ret.raw.dimensions.length);
  eq('orchestration: the level is echoed back', 'ultra', deep.ret && deep.ret.level);
  // The regression that motivates driving the pipeline at all: repoRoot and scope reach
  // the dimension prompts. A ReferenceError here is invisible to every helper assertion.
  truthy('orchestration: the repo root reaches the dimension prompts',
    deep.prompts.some((p) => p.includes('Repo root: /repo')));
  truthy('orchestration: the scope reaches the dimension prompts',
    deep.prompts.some((p) => p.includes('the api layer')));

  const shallow = await runReview('high');
  eq('orchestration: below ultra nothing is refuted', 0, shallow.labels.filter((l) => l.startsWith('verify:')).length);
  eq('orchestration: below ultra the review still reports', '# report',
    shallow.ret && shallow.ret.report && shallow.ret.report.report_markdown);

  // Every dimension agent dying is distinct from a bad-args failure and must say so.
  const { ret: allDead } = await load({
    agent: async () => null,
    args: { repoRoot: '/repo' },
    log: () => {},
    phase: () => {},
    parallel: async (thunks) => Promise.all(thunks.map((t) => t())),
    pipeline: async (items, ...stages) => Promise.all(items.map(async (item, i) => {
      let v = item;
      for (const s of stages) v = await s(v, item, i);
      return v;
    })),
  });
  truthy('orchestration: no dimension completing returns its own error',
    allDead && /no dimension review completed/.test(allDead.error || ''), `got ${JSON.stringify(allDead)}`);

  // ── broken-runtime guard ─────────────────────────────────────────────────────
  // No `agent` hook → the script must throw, not silently return undefined (which the
  // harness would record as a successful no-op).
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
