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
//   - dimensionSchema keeps one required core across all four dimensions
//   - the vocabulary file appears in the architecture procedure only when supplied
//   - the tests dimension stays static (no suite runs) and technology-independent
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
      receivedKeys: ['repoRoot', 'scope', 'vocabFile'], error: null,
    },
    normalizeArgs({ repoRoot: '/r', scope: 'the api layer', vocabFile: '/v.md' }));

  // The regression the seam exists for: args arriving as a JSON STRING must be parsed.
  // A naive `.repoRoot` read would be undefined, and the dimension prompts would ship the
  // literal "undefined" as the repo root — four agents reviewing the wrong tree.
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
  // string, so a truthiness check passes it through and four opus agents review whatever
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
  eq('buildDimensions: four dimensions in review order',
    ['consistency', 'structure', 'architecture', 'tests'], dims.map((d) => d.key));

  const arch = (v) => buildDimensions(v).find((d) => d.key === 'architecture').procedure;
  truthy('buildDimensions: the vocabulary file is cited when supplied',
    arch('/design-vocabulary.md').includes('/design-vocabulary.md'));
  truthy('buildDimensions: no dangling vocabulary sentence when it is absent',
    !/design vocabulary at/.test(arch('')));

  const cfg = { repoRoot: '/repo', scope: '' };
  const byKey = (k) => dims.find((d) => d.key === k);
  const promptFor = (k) => dimensionPrompt(byKey(k), cfg);
  truthy('dimensionPrompt: carries the repo root', promptFor('structure').includes('Repo root: /repo'));
  truthy('dimensionPrompt: structure is asked for tree_mermaid',
    promptFor('structure').includes('Also return tree_mermaid'));
  truthy('dimensionPrompt: consistency is not asked for tree_mermaid',
    !promptFor('consistency').includes('Also return tree_mermaid'));
  truthy('dimensionPrompt: architecture is asked for candidates',
    promptFor('architecture').includes('Also return candidates'));
  truthy('dimensionPrompt: tests carries neither visual payload',
    !promptFor('tests').includes('Also return tree_mermaid') &&
    !promptFor('tests').includes('Also return candidates'));

  // ── the tests dimension's two load-bearing boundaries ────────────────────────
  // 1. It is the STATIC half of test review. Every question whose honest answer needs the
  //    suite to run belongs to project-auto-work:test-tests, which measures it. A tests
  //    procedure that starts estimating runtime or flakiness from reading is the exact
  //    regression this pins — it reintroduces the guesswork the split removed.
  const testsProcedure = byKey('tests').procedure;
  truthy('tests dimension: forbids running the suite',
    /Do not run the suite/.test(testsProcedure));
  truthy('tests dimension: routes the measurable questions to the empirical audit',
    testsProcedure.includes('test-tests'));
  // 2. Technology independence: the plugin must not encode one language's idioms, or it
  //    silently misjudges every project that uses another. The procedure names semantic
  //    properties ("acquires a real resource outside the process") and makes the agent
  //    derive the repo's own conventions — never a token list to grep for.
  //    Scoped to the procedure deliberately: the shared PERSONA is common to all four
  //    dimensions and predates this rule (it cites dist/ and node_modules/ as examples of
  //    build output to skip), so widening the filter to the assembled prompt would fail on
  //    text this dimension does not own. The token list is a sample, not a proof — it
  //    catches the regression of writing a procedure against one stack, not every possible
  //    idiom.
  const techTokens = [
    'pytest', 'jest', 'junit', 'mocha', 'rspec', 'unittest', 'testify', 'conftest',
    'python', 'javascript', 'typescript', 'golang',
    'npm ', 'pip ', 'cargo ', '.py', '.js', '.ts', '.rb',
    'try/except', 'assertequal', 'mock.patch', 'sinon', 'describe(', 'beforeeach',
    'node_modules', 'dist/',
  ];
  const lowered = testsProcedure.toLowerCase();
  eq('tests procedure: carries no technology-specific idiom', [],
    techTokens.filter((t) => lowered.includes(t)));

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
  const keys = ['consistency', 'structure', 'architecture', 'tests'];
  eq('missingDimensions: none missing when all four returned', [],
    missingDimensions(keys.map((k) => ({ dimension: k })), keys));
  eq('missingDimensions: names the dimension that died', ['structure'],
    missingDimensions([{ dimension: 'consistency' }, { dimension: 'architecture' }, { dimension: 'tests' }], keys));
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
  // `over` lets a case reshape one stage without rebuilding the whole harness:
  //   deadDimension — that review agent returns null (partial failure)
  //   verifyVerdict — what every verify agent returns (refutation actually dropping findings)
  const runReview = async (level, over = {}) => {
    const labels = [];
    const prompts = [];
    const agent = async (prompt, opts = {}) => {
      labels.push(opts.label);
      prompts.push(prompt);
      if (opts.label.startsWith('review:')) {
        const key = opts.label.split(':')[1];
        if (over.deadDimension === key) return null;
        return {
          dimension: key,
          verdict: 'minor issues',
          findings: [{
            severity: 'major', location: 'a.js:1', observation: 'o',
            evidence: 'e', why_it_matters: 'w', recommended_action: 'r',
          }],
        };
      }
      if (opts.label.startsWith('verify:')) return over.verifyVerdict || { refuted: false, reason: '' };
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

  const synthesisPrompt = (r) => r.prompts[r.prompts.length - 1];

  const deep = await runReview('ultra');
  eq('orchestration: one review agent per dimension',
    ['review:consistency', 'review:structure', 'review:architecture', 'review:tests'],
    deep.labels.filter((l) => l.startsWith('review:')));
  eq('orchestration: ultra spawns one verify agent per finding', 4,
    deep.labels.filter((l) => l.startsWith('verify:')).length);
  eq('orchestration: the report is returned', '# report', deep.ret && deep.ret.report && deep.ret.report.report_markdown);
  eq('orchestration: the raw dimension results are carried out', 4, deep.ret && deep.ret.raw.dimensions.length);
  eq('orchestration: the level is echoed back', 'ultra', deep.ret && deep.ret.level);
  // The regression that motivates driving the pipeline at all: repoRoot and scope reach
  // the dimension prompts. A ReferenceError here is invisible to every helper assertion.
  truthy('orchestration: the repo root reaches the dimension prompts',
    deep.prompts.some((p) => p.includes('Repo root: /repo')));
  truthy('orchestration: the scope reaches the dimension prompts',
    deep.prompts.some((p) => p.includes('the api layer')));

  // Spawning a verify agent is not refuting. Refutation is the ONLY behaviour ultra adds,
  // and its whole job is to REMOVE findings — so drive a refuting verdict and assert the
  // finding is actually gone. With the all-survive stub alone, an inverted filter at the
  // kept/refuted partition would ship every refuted finding and the suite would stay green.
  const refuted = await runReview('ultra', { verifyVerdict: { refuted: true, reason: 'evidence does not hold' } });
  const firstDim = refuted.ret && refuted.ret.raw.dimensions[0];
  eq('orchestration: a refuted finding is dropped from the dimension', 0,
    firstDim && firstDim.findings.length);
  eq('orchestration: the refuted finding is carried with its reason', ['evidence does not hold'],
    firstDim && firstDim.refuted.map((r) => r.reason));
  truthy('orchestration: a fully refuted dimension still reaches synthesis',
    refuted.ret && refuted.ret.report && refuted.ret.report.report_markdown === '# report');

  const shallow = await runReview('high');
  eq('orchestration: below ultra nothing is refuted', 0, shallow.labels.filter((l) => l.startsWith('verify:')).length);
  eq('orchestration: below ultra the review still reports', '# report',
    shallow.ret && shallow.ret.report && shallow.ret.report.report_markdown);

  // PARTIAL failure — distinct from all-dead below, and the case the fourth dimension made
  // more likely. missingDimensions is unit-tested above, but its only consumer is the
  // synthesis clause that caps a missing dimension's verdict; without this the report could
  // present three dimensions as a complete four-dimension review and nothing would notice.
  const partial = await runReview('medium', { deadDimension: 'tests' });
  eq('orchestration: a dead dimension is dropped from the raw results', 3,
    partial.ret && partial.ret.raw.dimensions.length);
  truthy('orchestration: synthesis is told which dimension did not complete',
    /did not complete \(tests\)/.test(synthesisPrompt(partial) || ''));
  truthy('orchestration: a partial run still produces a report',
    partial.ret && partial.ret.report && partial.ret.report.report_markdown === '# report');

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
