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

  const {
    normalizeArgs, parseManifest, selectFileRoutes, splitReviewTargets,
    orderRoutesByHistoryGap, historyFindingBar,
    LEVEL_CONFIG, USE_CASES, MIN_SEGMENTS_FOR_FINDING,
  } = helpers;

  const required = { normalizeArgs, parseManifest, selectFileRoutes };
  const missingExport = Object.keys(required).filter((k) => typeof required[k] !== 'function');
  if (missingExport.length) {
    bad('review-docs.js exposes its pure helpers', `missing or not a function: ${missingExport.join(', ')}`);
    console.log(`\nResults: ${pass} passed, ${fail} failed`);
    process.exit(1);
  }
  ok('review-docs.js exposes its pure helpers');

  // ── normalizeArgs ────────────────────────────────────────────────────────────
  const good = normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts', standardDir: '/std' });
  eq('normalizeArgs: a valid config carries no error', null, good.error);
  eq('normalizeArgs: level defaults to medium', 'medium', good.level);
  // The standard lives in another plugin, so both artifacts hang off standardDir — never
  // off scriptsDir, whose sibling directories belong to the reviewer, not the standard.
  eq('normalizeArgs: the authoring rules resolve under the standard directory',
    '/std/references/project-doc-guidelines.md', good.guidelinesFile);
  eq('normalizeArgs: the ownership contracts resolve under the standard directory',
    '/std/references/project-setup.md', good.setupFile);
  eq('normalizeArgs: a trailing slash on standardDir does not double the separator',
    '/std/references/project-doc-guidelines.md',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts', standardDir: '/std/' }).guidelinesFile);

  // The regression the seam exists for: args arriving as a JSON STRING must be parsed,
  // or every field is undefined and the run dies at "undefined/manifest.py".
  eq('normalizeArgs: JSON-string payload is parsed (undefined-manifest regression guard)',
    '/parsed/root',
    normalizeArgs('{"repoRoot":"/parsed/root","scriptsDir":"/s/scripts","standardDir":"/std"}').repoRoot);

  truthy('normalizeArgs: a missing repoRoot is rejected and named',
    /repoRoot/.test(normalizeArgs({ scriptsDir: '/s/scripts', standardDir: '/std' }).error || ''));
  truthy('normalizeArgs: a missing scriptsDir is rejected and named',
    /scriptsDir/.test(normalizeArgs({ repoRoot: '/r', standardDir: '/std' }).error || ''));
  // Without it the read-review agents lose the authoring rules and every file loses its
  // ownership contract — the audit would still run and quietly grade against nothing.
  truthy('normalizeArgs: a missing standardDir is rejected and named',
    /standardDir/.test(normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts' }).error || ''));
  truthy('normalizeArgs: a relative standardDir is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts', standardDir: 'rel/std' }).error || ''));
  truthy('normalizeArgs: non-JSON string is rejected', normalizeArgs('not json').error);
  truthy('normalizeArgs: undefined is rejected', normalizeArgs(undefined).error);

  // An unsubstituted "<…>" placeholder is a non-empty string, so a truthiness check would
  // pass it straight to `python3 manifest.py "<…>"`.
  truthy('normalizeArgs: an unsubstituted placeholder repoRoot is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: '<the step-1 path>', scriptsDir: '/s/scripts' }).error || ''));
  truthy('normalizeArgs: a relative scriptsDir is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: '/r', scriptsDir: 'rel/scripts' }).error || ''));

  // `cost` was renamed to `level`. Silently ignoring it hands a caller who asked for an
  // ultra audit a medium one — 3 routes, no refutation — and reports raw.level 'medium'.
  truthy('normalizeArgs: the renamed `cost` argument is rejected, not silently dropped',
    /level/.test(normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts', standardDir: '/std', cost: 'ultra' }).error || ''));
  eq('normalizeArgs: the received keys are echoed for diagnosis',
    ['repoRoot', 'scriptDir'], normalizeArgs({ repoRoot: '/r', scriptDir: '/s' }).receivedKeys);

  // An unsubstituted "<SCRATCH>" placeholder is truthy and would slip past a bare falsy
  // check, then be created inside the repo the audit promised not to touch.
  truthy('normalizeArgs: a relative scratchDir is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts', standardDir: '/std', scratchDir: '<SCRATCH>' }).error || ''));
  eq('normalizeArgs: an absolute scratchDir is accepted', null,
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts', standardDir: '/std', scratchDir: '/tmp/x' }).error);

  // ── the shared level vocabulary and its route budget ─────────────────────────
  for (const lvl of ['low', 'medium', 'high', 'ultra']) {
    eq(`level: ${lvl} is accepted`, lvl, normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: lvl }).level);
  }
  eq('level: an unknown token falls back to medium', 'medium',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'turbo' }).level);
  eq('level: is case-insensitive', 'high',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'HIGH' }).level);

  // Execution is a level switch, not a route budget: ultra runs every route and every
  // other rung runs none. A rung that silently ran execution would be ~3x its stated cost.
  const maxExecFor = (level) => normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level }).maxExec;
  eq('level: low runs no execution phase', 0, maxExecFor('low'));
  eq('level: medium runs no execution phase', 0, maxExecFor('medium'));
  eq('level: high runs no execution phase', 0, maxExecFor('high'));
  eq('level: ultra runs every route', -1, maxExecFor('ultra'));
  eq('level: ultra is the only rung that executes', ['ultra'],
    Object.keys(LEVEL_CONFIG).filter((l) => LEVEL_CONFIG[l].execution));

  // low is the only rung that downgrades the read-review model. Without that, low and
  // high cost nearly the same and the cheap token is a lie.
  eq('level: only low downgrades the read-review model', ['low'],
    Object.keys(LEVEL_CONFIG).filter((l) => LEVEL_CONFIG[l].reviewModel !== 'opus'));
  eq('level: low reports history coverage but cannot raise a history finding', false,
    LEVEL_CONFIG.low.historyFindings);
  truthy('level: low samples fewer segments than it takes to clear the finding floor',
    LEVEL_CONFIG.low.perUseCase < MIN_SEGMENTS_FOR_FINDING);
  for (const lvl of ['medium', 'high', 'ultra']) {
    truthy(`level: ${lvl} can reach the finding floor`,
      LEVEL_CONFIG[lvl].historyFindings && LEVEL_CONFIG[lvl].perUseCase >= MIN_SEGMENTS_FOR_FINDING);
  }

  // maxExecutionRoutes is the documented advanced override, including the value 0,
  // which a falsy-guard implementation would silently discard.
  eq('maxExecutionRoutes: overrides the level budget', 7,
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'medium', maxExecutionRoutes: 7 }).maxExec);
  eq('maxExecutionRoutes: an explicit 0 is honoured, not treated as unset', 0,
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'high', maxExecutionRoutes: 0 }).maxExec);
  // selectFileRoutes branches on `=== 0` and `> 0`. A string "0" — which a model filling
  // the args object as JSON text emits — satisfies neither, so without coercion it falls
  // through to "run every route": the caller asks for none and gets one live action agent
  // per AGENTS.md route.
  eq('maxExecutionRoutes: a string "0" is coerced, not fallen through', 0,
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', maxExecutionRoutes: '0' }).maxExec);
  eq('maxExecutionRoutes: a string "-1" is coerced', -1,
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', maxExecutionRoutes: '-1' }).maxExec);
  eq('maxExecutionRoutes: null falls back to the level default, not to every route', 0,
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'medium', maxExecutionRoutes: null }).maxExec);
  truthy('maxExecutionRoutes: a non-integer is rejected rather than silently ignored',
    /integer/.test(normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', standardDir: '/std', maxExecutionRoutes: 'all' }).error || ''));

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

  // ── splitReviewTargets ───────────────────────────────────────────────────────
  const targets = splitReviewTargets([
    { path: 'docs/CODING.md', classification: 'canonical' },
    { path: 'docs/TESTING.md', classification: 'canonical' },
    { path: 'AGENTS.md', classification: 'canonical' },
    { path: 'README.md', classification: 'canonical' },
    { path: 'docs/WHATEVER.md', classification: 'non-standard' },
    { path: 'CLAUDE.md', classification: 'canonical' },
    { path: 'CHANGELOG.md', classification: 'meta' },
    { path: '.claude.local.md', classification: 'personal-local' },
  ]);
  eq('splitReviewTargets: a canonical topic doc becomes its use case',
    ['coding', 'testing'], targets.useCases.map((u) => u.useCase).sort());
  eq('splitReviewTargets: the files that are not use cases keep a per-file reviewer',
    ['AGENTS.md', 'README.md', 'docs/WHATEVER.md'], targets.residual.map((f) => f.path).sort());
  truthy('splitReviewTargets: CLAUDE.md is excluded — the manifest checks it mechanically',
    !targets.residual.some((f) => f.path === 'CLAUDE.md'));
  truthy('splitReviewTargets: meta and personal-local files are excluded',
    !targets.residual.some((f) => f.path === 'CHANGELOG.md' || f.path === '.claude.local.md'));
  // The standard makes every topic doc optional and never reports one missing, so an
  // absent doc must produce no agent at all rather than an empty-file finding.
  eq('splitReviewTargets: a use case whose doc does not exist is not reviewed',
    0, splitReviewTargets([{ path: 'README.md', classification: 'canonical' }]).useCases.length);
  eq('splitReviewTargets: an empty manifest is tolerated',
    { useCases: [], residual: [] }, splitReviewTargets([]));
  eq('splitReviewTargets: every use case maps to a docs/ topic file',
    [], Object.keys(USE_CASES).filter((u) => !/^docs\/[A-Z-]+\.md$/.test(USE_CASES[u].doc)));

  // ── orderRoutesByHistoryGap ──────────────────────────────────────────────────
  const gapRoutes = [
    { target: 'docs/CLEAN.md' }, { target: 'docs/MISSED.md' }, { target: 'docs/UNSEEN.md' },
  ];
  const seen = {
    'docs/CLEAN.md': { evaluated: true, missed: false },
    'docs/MISSED.md': { evaluated: true, missed: true },
  };
  eq('orderRoutesByHistoryGap: no evidence first, then misses, then the clean ones',
    ['docs/UNSEEN.md', 'docs/MISSED.md', 'docs/CLEAN.md'],
    orderRoutesByHistoryGap(gapRoutes, seen).map((r) => r.target));
  eq('orderRoutesByHistoryGap: with no history at all the input order is kept',
    ['docs/CLEAN.md', 'docs/MISSED.md', 'docs/UNSEEN.md'],
    orderRoutesByHistoryGap(gapRoutes, {}).map((r) => r.target));
  eq('orderRoutesByHistoryGap: reordering never drops or duplicates a route',
    3, orderRoutesByHistoryGap(gapRoutes, seen).length);
  eq('orderRoutesByHistoryGap: an absent route list is tolerated', [],
    orderRoutesByHistoryGap(undefined, seen));

  // ── historyFindingBar ────────────────────────────────────────────────────────
  const med = LEVEL_CONFIG.medium;
  truthy('historyFindingBar: enough valid segments clears the bar',
    historyFindingBar({ coverage: { valid: MIN_SEGMENTS_FOR_FINDING } }, med).canFind);
  truthy('historyFindingBar: one segment below the floor cannot raise a finding',
    !historyFindingBar({ coverage: { valid: MIN_SEGMENTS_FOR_FINDING - 1 } }, med).canFind);
  truthy('historyFindingBar: a level with findings disabled never clears the bar',
    !historyFindingBar({ coverage: { valid: 99 } }, LEVEL_CONFIG.low).canFind);
  truthy('historyFindingBar: no coverage at all cannot raise a finding',
    !historyFindingBar({}, med).canFind && !historyFindingBar(undefined, med).canFind);

  // ── bad-args bailout (orchestration) ─────────────────────────────────────────
  truthy('bailout: bad args return the diagnostic error object',
    ret && typeof ret.error === 'string' && /repoRoot/.test(ret.error),
    `got ${JSON.stringify(ret)}`);
  eq('bailout: the error object echoes the received args type', 'string', ret && ret.got && ret.got.type);
  if (!agentCalled) ok('bailout: no agent spawned on the bad-args path');
  else bad('bailout: no agent spawned on the bad-args path');

  // ── orchestration ────────────────────────────────────────────────────────────
  // Drive the FULL manifest → read-review → execution → (ultra) verify → synthesis
  // pipeline through stubbed hooks. Without this the orchestration block never executes,
  // so a variable dropped from its destructure would throw a ReferenceError only during a
  // real multi-agent run while every helper assertion above still passed.
  const metrics = { lines: 10, words: 50, non_heading_lines: 8 };
  const contract = { audience: 'a', inside: 'i', not_inside: 'n' };
  const manifest = {
    summary: { total_md: 3, canonical_missing: 0, unresolved_links: 0, orphans: 0 },
    files: [
      { path: 'docs/CODING.md', classification: 'canonical', metrics, contract },
      { path: 'AGENTS.md', classification: 'canonical', metrics, contract },
      { path: 'docs/A.md', classification: 'non-standard', metrics },
    ],
    agents_routes: [
      { kind: 'file', target: 'docs/CODING.md', text: '**MUST read [docs/CODING.md](docs/CODING.md) before editing ANY file.**' },
      { kind: 'file', target: 'docs/B.md', text: 'See [docs/B.md](docs/B.md) for details.' },
      { kind: 'file', target: 'docs/C.md', text: '' },
      { kind: 'file', target: 'docs/D.md', text: '' },
    ],
    missing_canonical: [], orphans: [], location_violations: [], injected_blocks: [],
  };

  // The history stage's script output, stubbed at the two points it shells out.
  const promptIndex = {
    repo_root: '/repo', projects_dir: '/p', transcripts_found: 2, sessions_with_prompts: 2,
    batches: [{ file: '/tmp/sc/history/prompts-01.json', labels_file: '/tmp/sc/history/labels-01.json', sessions: 2, messages: 10 }],
  };
  const evidence = {
    evidence_file: '/tmp/sc/history/evidence.json', sessions_scanned: 2, sessions_labelled: 2,
    coverage: {
      coding: { labelled: 6, valid: 4, partial: 1, excluded_churn: 2 },
      testing: { labelled: 0, valid: 0, partial: 0, excluded_churn: 0 },
    },
  };

  const runAudit = async (over = {}) => {
    // promptIndex is a stub override for the history script, not a workflow argument.
    const { promptIndex: promptOverride, ...argOver } = over;
    const labels = [];
    const prompts = [];
    const agent = async (prompt, opts = {}) => {
      labels.push(opts.label);
      prompts.push(prompt);
      if (opts.label === 'manifest') return '```json\n' + JSON.stringify(manifest) + '\n```';
      if (opts.label === 'history:extract') return JSON.stringify(promptOverride || promptIndex);
      if (opts.label === 'history:evidence') return JSON.stringify(evidence);
      if (opts.label.startsWith('history:label-')) {
        return { labels_file: '/tmp/sc/history/labels-01.json', sessions_labelled: 2, messages_labelled: 10 };
      }
      if (opts.label.startsWith('history:')) {
        return {
          use_case: 'coding', doc: 'docs/CODING.md', segments_judged: 4, routed: 1, late: 0,
          missed: 3, not_applicable: 0, route_wording: 'obligation', attribution: 'agent',
          severity: 'minor', finding: 'skipped despite a hard route',
        };
      }
      if (opts.label.startsWith('read:') || opts.label.startsWith('use-case:')) {
        return { file: 'docs/CODING.md', findings: [{ category: 'accuracy', severity: 'major', observation: 'o', evidence: 'e', recommended_action: 'r' }] };
      }
      if (opts.label.startsWith('gen:')) return { task: 't', expected: 'e', tier: 'A' };
      if (opts.label.startsWith('do:')) return { completed: true, answer: 'a', docs_consulted: [] };
      if (opts.label.startsWith('grade:')) return { route: 'docs/A.md', verdict: 'routed-and-succeeded', attribution: 'doc' };
      return { verdict: 'minor gaps', headline: 'h', findings: [] };
    };
    const { ret } = await load({
      agent,
      args: { repoRoot: '/repo', scriptsDir: '/s/scripts', standardDir: '/std', scratchDir: '/tmp/sc', ...argOver },
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
  eq('orchestration: ultra runs every deduped route', 4, deep.labels.filter((l) => l.startsWith('gen:')).length);
  eq('orchestration: the report is returned', 'minor gaps', deep.ret && deep.ret.report && deep.ret.report.verdict);
  eq('orchestration: the level is echoed in raw', 'ultra', deep.ret && deep.ret.raw.level);
  eq('orchestration: the pre-cap route total is reported', 4, deep.ret && deep.ret.raw.routes_total);
  // The regression that motivates driving the pipeline: repoRoot and the derived
  // guidelines path reach the read-review prompts.
  truthy('orchestration: the repo root reaches the read-review prompts',
    deep.prompts.some((p) => p.includes('Repo root: /repo')));
  truthy('orchestration: the authoring rules path reaches the read-review prompts',
    deep.prompts.some((p) => p.includes('/std/references/project-doc-guidelines.md')));
  truthy('orchestration: the scratch dir reaches the execution prompts',
    deep.prompts.some((p) => p.includes('/tmp/sc')));
  eq('orchestration: the verify stage is gone', 0, deep.labels.filter((l) => l.startsWith('verify:')).length);

  // ── read-review legs ─────────────────────────────────────────────────────────
  eq('read-review: a canonical topic doc is reviewed as its use case, not as a file',
    ['use-case:coding'], deep.labels.filter((l) => l.startsWith('use-case:')));
  truthy('read-review: AGENTS.md and the non-standard doc keep per-file reviewers',
    deep.labels.includes('read:AGENTS.md') && deep.labels.includes('read:docs/A.md'));
  truthy('read-review: no file gets reviewed twice',
    !deep.labels.includes('read:docs/CODING.md'));
  truthy('read-review: the use-case agent is framed as doing the work, not auditing a file',
    deep.prompts.some((p) => p.includes('You are here to create or edit a file in the source tree')));
  truthy('read-review: the route wording reaches the use-case agent',
    deep.prompts.some((p) => p.includes('use-case') || p.includes('MUST read [docs/CODING.md]')));
  truthy('read-review: the severity bar reaches every reviewer',
    deep.prompts.filter((p) => p.includes('SEVERITY — assign every finding')).length >= 2);

  // ── history ──────────────────────────────────────────────────────────────────
  truthy('history: the extract step runs before any classification',
    deep.labels.indexOf('history:extract') < deep.labels.indexOf('history:label-1'));
  eq('history: one classifier per prompt batch', 1, deep.labels.filter((l) => l.startsWith('history:label-')).length);
  eq('history: only use cases with valid evidence are judged',
    ['history:coding'], deep.labels.filter((l) => /^history:(?!extract|evidence|label-)/.test(l)));
  eq('history: verdicts reach raw', 4, deep.ret && deep.ret.raw.history[0].segments_judged);
  eq('history: coverage reaches raw', 4, deep.ret && deep.ret.raw.history_coverage.coding.valid);
  truthy('history: the judge is told AGENTS.md is never Read, so its absence proves nothing',
    deep.prompts.some((p) => p.includes('AGENTS.md is always in an agent') && p.includes('never Read')));
  truthy('history: an obligation route that is skipped accuses the agent, not the doc',
    deep.prompts.some((p) => p.includes('obligation route + misses => attribution "agent"')));
  truthy('history: an advisory route that is skipped accuses the doc',
    deep.prompts.some((p) => p.includes('advisory (or absent) route + misses => attribution "doc"')));

  const medium = await runAudit({ level: 'medium' });
  eq('orchestration: medium runs no execution route', 0, medium.labels.filter((l) => l.startsWith('gen:')).length);
  eq('orchestration: medium still runs history', 1, medium.labels.filter((l) => l === 'history:coding').length);
  truthy('history: medium clears the finding floor, so a finding is allowed',
    medium.prompts.some((p) => p.includes('a finding is allowed')));

  const noExec = await runAudit({ level: 'low' });
  eq('orchestration: low runs no execution route at all',
    0, noExec.labels.filter((l) => l.startsWith('gen:')).length);
  eq('orchestration: low still read-reviews and reports', 'minor gaps',
    noExec.ret && noExec.ret.report && noExec.ret.report.verdict);
  truthy('history: low is held to coverage-only, below the finding floor',
    noExec.prompts.some((p) => p.includes('Do not raise a finding from this sample')));

  // A repo nobody has opened in Claude Code has no transcripts. That is a gap in the
  // audit, not a defect in the docs — the stage must skip rather than invent evidence.
  const noHistory = await runAudit({ level: 'medium', promptIndex: { projects_dir: '/p', batches: [] } });
  eq('history: no transcripts means no classifier runs', 0,
    noHistory.labels.filter((l) => l.startsWith('history:label-')).length);
  eq('history: no transcripts means no use case is judged', 0,
    noHistory.labels.filter((l) => /^history:(?!extract|evidence|label-)/.test(l)).length);
  eq('history: the audit still completes and reports', 'minor gaps',
    noHistory.ret && noHistory.ret.report && noHistory.ret.report.verdict);

  // An unparseable manifest must abort with its own error, not proceed on garbage.
  const { ret: badManifest } = await load({
    agent: async (_p, o) => (o.label === 'manifest' ? 'no json here' : null),
    args: { repoRoot: '/repo', scriptsDir: '/s/scripts', standardDir: '/std', scratchDir: '/tmp/sc' },
    log: () => {},
    phase: () => {},
    parallel: async (thunks) => Promise.all(thunks.map((t) => t())),
    pipeline: async () => [],
  });
  truthy('orchestration: an unparseable manifest aborts loudly',
    badManifest && /manifest parse failed/.test(badManifest.error || ''), `got ${JSON.stringify(badManifest)}`);

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
