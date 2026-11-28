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
//   - the level vocabulary shared with project-review-codebase and test-tests, and what
//     each rung buys
//   - parseManifest survives the wrappings a model actually returns JSON in
//   - orderTargets / packBatches / unreviewedFiles: how docs reach the batch agents, and
//     that a file no agent reviewed is reported by name
//   - recordTargets / recordsPrompt: the decision records reach one agent as a set, with
//     the manifest's facts and one numbered question per clause of their contract
//   - the orchestration: the cost bounds (a fixed read list per agent, explicit model and
//     effort on every agent, one history judge) and the prompts each stage receives
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
    normalizeArgs, parseManifest, checkManifest, checkPromptIndex, checkEvidence, splitReviewTargets, orderTargets, packBatches,
    recordTargets, recordsPrompt, unreviewedFiles, historyFindingBar,
    LEVEL_CONFIG, USE_CASES, BATCH_BYTES, RECORDS_CONTEXT_BYTES, MIN_SEGMENTS_FOR_FINDING, RELAY_ATTEMPTS,
  } = helpers;

  const required = { normalizeArgs, parseManifest, checkManifest, checkPromptIndex, checkEvidence, splitReviewTargets, orderTargets, packBatches, recordTargets, recordsPrompt, unreviewedFiles, historyFindingBar };
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
  // The standard lives in another plugin, so all three artifacts hang off standardDir — never
  // off scriptsDir, whose sibling directories belong to the reviewer, not the standard.
  eq('normalizeArgs: the authoring rules resolve under the standard directory',
    '/std/references/project-doc-guidelines.md', good.guidelinesFile);
  eq('normalizeArgs: the ownership contracts resolve under the standard directory',
    '/std/references/project-setup.md', good.setupFile);
  // The hygiene rules are shared by both instruction-writing skills, so they sit at that
  // plugin's root and the path climbs out of the skill. A review agent is spawned with paths
  // and never loads the skill, so dropping this leaves the guidelines' redirects dead-ended.
  eq('normalizeArgs: the shared hygiene rules climb to the standard plugin root',
    '/std/../../references/writing-hygiene.md', good.hygieneFile);
  eq('normalizeArgs: a trailing slash on standardDir does not double the separator',
    '/std/references/project-doc-guidelines.md',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s/scripts', standardDir: '/std/' }).guidelinesFile);
  // The batch agents are handed `${repoRoot}/${path}` to Read.
  eq('normalizeArgs: a trailing slash on repoRoot is dropped', '/r',
    normalizeArgs({ repoRoot: '/r/', scriptsDir: '/s/scripts', standardDir: '/std' }).repoRoot);

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
  // ultra audit a medium one and reports raw.level 'medium'.
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

  // ── the shared level vocabulary ──────────────────────────────────────────────
  for (const lvl of ['low', 'medium', 'high', 'ultra']) {
    eq(`level: ${lvl} is accepted`, lvl, normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: lvl }).level);
  }
  eq('level: an unknown token falls back to medium', 'medium',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'turbo' }).level);
  eq('level: is case-insensitive', 'high',
    normalizeArgs({ repoRoot: '/r', scriptsDir: '/s', level: 'HIGH' }).level);

  // Every rung must differ from the one below it in something a user can feel — a model,
  // an effort, or whether history can raise findings — not only in history sample size.
  const rungs = ['low', 'medium', 'high', 'ultra'];
  for (let i = 1; i < rungs.length; i++) {
    const a = LEVEL_CONFIG[rungs[i - 1]], b = LEVEL_CONFIG[rungs[i]];
    truthy(`level: ${rungs[i]} differs from ${rungs[i - 1]} in more than sample size`,
      a.reviewModel !== b.reviewModel || a.reviewEffort !== b.reviewEffort || a.historyFindings !== b.historyFindings);
  }
  // No rung may buy depth by letting an agent gather more: that is the quadratic cost the
  // batch design removed. A rung that re-adds a stage has to come through here.
  eq('level: every rung is only model, effort, and history sample',
    ['historyFindings', 'perUseCase', 'reviewEffort', 'reviewModel', 'sessionLimit'],
    [...new Set(Object.values(LEVEL_CONFIG).flatMap((c) => Object.keys(c)))].sort());
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
  // history.py reads --limit 0 as "every session". One classifier runs per 12 sessions, so
  // an uncapped rung spawns agents in proportion to how long the repo has been worked in.
  truthy('level: every rung caps the history sample',
    Object.values(LEVEL_CONFIG).every((c) => c.sessionLimit > 0));

  // ── checkManifest ────────────────────────────────────────────────────────────
  const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e)); } };
  const noFacts = { records: 0, flagged: [], duplicate_numbers: [], not_records: [], replaced_still_present: [] };
  const whole = { summary: { total_md: 1, decision_record_facts: 0 }, files: [{ path: 'README.md' }], agents_routes: [], decisions: noFacts };
  eq('checkManifest: a complete manifest passes', whole, checkManifest(whole));
  truthy('checkManifest: a relay of null is named, not reported as undefined',
    throwsWith(() => checkManifest(null), /the relay is null/));
  truthy('checkManifest: a relay without files is rejected',
    throwsWith(() => checkManifest({ summary: { total_md: 0 }, agents_routes: [] }), /lacks summary, files, agents_routes or decisions/));
  const { decisions: _tree, ...noTree } = whole;
  truthy('checkManifest: a relay without the decision-record facts is rejected',
    throwsWith(() => checkManifest(noTree), /lacks summary, files, agents_routes or decisions/));
  // The records agent counts nothing itself, so a fact the relay dropped is a breach no stage sees.
  const flaggedOnce = { ...noFacts, flagged: [{ path: 'docs/decisions/0001-a.md', flags: ['f1', 'f2'] }], not_records: ['docs/decisions/README.md'] };
  eq('checkManifest: a relay with every decision-record fact passes', flaggedOnce,
    checkManifest({ ...whole, summary: { total_md: 1, decision_record_facts: 3 }, decisions: flaggedOnce }).decisions);
  truthy('checkManifest: a relay that lost a decision-record fact is rejected',
    throwsWith(() => checkManifest({ ...whole, summary: { total_md: 1, decision_record_facts: 4 }, decisions: flaggedOnce }),
      /lists 3 of the 4 decision-record facts/));
  truthy('checkManifest: a decisions block retyped without a list is rejected, not read as empty',
    throwsWith(() => checkManifest({ ...whole, decisions: { records: 0 } }), /without its four lists/) &&
    throwsWith(() => checkManifest({ ...whole, decisions: { ...noFacts, flagged: [{ path: 'p' }] } }), /without its four lists/));
  // A model that stops partway through `files` and closes the brackets returns valid JSON.
  truthy('checkManifest: a relay that lost files from the end is rejected',
    throwsWith(() => checkManifest({ ...whole, summary: { total_md: 2 } }), /lists 1 of the 2 files/));

  // ── checkPromptIndex / checkEvidence ─────────────────────────────────────────
  const index = { sessions_with_prompts: 3, batches: [{ sessions: 2 }, { sessions: 1 }], complete: true };
  eq('checkPromptIndex: a complete prompt index passes', index, checkPromptIndex(index));
  truthy('checkPromptIndex: a relay without the closing sentinel is rejected',
    throwsWith(() => checkPromptIndex({ ...index, complete: undefined }), /not a complete prompt index/));
  truthy('checkPromptIndex: a relay that lost a batch from the end is rejected',
    throwsWith(() => checkPromptIndex({ ...index, batches: index.batches.slice(0, 1) }), /batches 2 of the 3 sessions/));
  truthy('checkPromptIndex: a relay without batches is rejected',
    throwsWith(() => checkPromptIndex({ sessions_with_prompts: 0, complete: true }), /not a complete prompt index/));
  // A relay of the wrong file can carry a whole transcript; the error names it, never pastes it.
  truthy('checkPromptIndex: a rejected relay is named by its keys, not pasted',
    throwsWith(() => checkPromptIndex({ sessions: ['a long transcript'] }), /^(?!.*long transcript).*keys sessions/));
  const allCases = (v) => Object.fromEntries(Object.keys(USE_CASES).map((u) => [u, v]));
  const summary = {
    coverage: { ...allCases({ valid: 0 }), coding: { valid: 1, historical_examined: 3 } },
    evidence_files: allCases('/f.json'),
    historical: { coding: [{ segments: 2 }, { segments: 1 }] },
    complete: true,
  };
  eq('checkEvidence: a complete evidence summary passes', summary, checkEvidence(summary));
  // A copy cut inside the last coverage entry, with no superseded routes, keeps every key.
  truthy('checkEvidence: a relay without the closing sentinel is rejected',
    throwsWith(() => checkEvidence({ ...summary, complete: undefined }), /not a complete evidence summary/));
  truthy('checkEvidence: a relay that lost a use case is rejected',
    throwsWith(() => checkEvidence({ ...summary, evidence_files: { coding: '/f.json' } }), /lacks the use case/));
  // historical is the summary's last key, so a copy cut short loses its buckets first.
  truthy('checkEvidence: a relay that lost superseded-route buckets is rejected',
    throwsWith(() => checkEvidence({ ...summary, historical: { coding: [{ segments: 2 }] } }), /incomplete for coding/));

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

  // ── splitReviewTargets ───────────────────────────────────────────────────────
  const targets = splitReviewTargets([
    { path: 'docs/CODING.md', classification: 'canonical' },
    { path: 'docs/TESTING.md', classification: 'canonical' },
    { path: 'AGENTS.md', classification: 'canonical' },
    { path: 'README.md', classification: 'canonical' },
    { path: 'docs/WHATEVER.md', classification: 'non-standard' },
    { path: 'CLAUDE.md', classification: 'canonical' },
    { path: 'CHANGELOG.md', classification: 'meta' },
    { path: 'CLAUDE.local.md', classification: 'personal-local' },
    { path: '.claude.local.md', classification: 'personal-legacy' },
  ]);
  eq('splitReviewTargets: a canonical topic doc becomes its use case',
    ['coding', 'testing'], targets.useCases.map((u) => u.useCase).sort());
  eq('splitReviewTargets: the files that are not use cases are still reviewed',
    ['AGENTS.md', 'README.md', 'docs/WHATEVER.md'], targets.residual.map((f) => f.path).sort());
  truthy('splitReviewTargets: CLAUDE.md is excluded — the manifest checks it mechanically',
    !targets.residual.some((f) => f.path === 'CLAUDE.md'));
  truthy('splitReviewTargets: meta, personal-local and personal-legacy files are excluded',
    !targets.residual.some((f) => ['CHANGELOG.md', 'CLAUDE.local.md', '.claude.local.md'].includes(f.path)));
  // The standard makes every topic doc optional and never reports one missing, so an
  // absent doc must produce no review at all rather than an empty-file finding.
  eq('splitReviewTargets: a use case whose doc does not exist is not reviewed',
    0, splitReviewTargets([{ path: 'README.md', classification: 'canonical' }]).useCases.length);
  eq('splitReviewTargets: an empty manifest is tolerated',
    { useCases: [], residual: [] }, splitReviewTargets([]));
  eq('splitReviewTargets: every use case maps to a docs/ topic file',
    [], Object.keys(USE_CASES).filter((u) => !/^docs\/[A-Z-]+\.md$/.test(USE_CASES[u].doc)));
  // The decision records leave the doc batches: one agent judges them as a set.
  const recordFiles = [
    { path: 'docs/decisions/0002-b.md', classification: 'decision' },
    { path: 'docs/A.md', classification: 'non-standard' },
    { path: 'docs/decisions/0001-a.md', classification: 'decision' },
  ];
  const withRecord = splitReviewTargets(recordFiles);
  eq('splitReviewTargets: a decision record is no use case', [], withRecord.useCases.map((u) => u.useCase));
  eq('splitReviewTargets: a decision record is no doc-batch target', ['docs/A.md'], withRecord.residual.map((f) => f.path));
  eq('recordTargets: the records alone, by path',
    ['docs/decisions/0001-a.md', 'docs/decisions/0002-b.md'], recordTargets(recordFiles).map((t) => t.file.path));
  eq('recordTargets: a repo without records has none', [], recordTargets([{ path: 'docs/A.md', classification: 'non-standard' }]));

  // ── recordsPrompt ────────────────────────────────────────────────────────────
  const recordsAsk = recordsPrompt({
    repoRoot: '/repo', setupFile: '/std/references/project-setup.md', hygieneFile: '/std/../../references/writing-hygiene.md',
    records: recordTargets(recordFiles), hasAgents: true, privateLayout: false,
    tree: {
      flagged: [{ path: 'docs/decisions/0001-a.md', flags: ['11 lines under the heading, the contract allows 8'] }],
      duplicate_numbers: [{ number: '0002', paths: ['docs/decisions/0002-b.md', 'docs/decisions/0002-c.md'] }],
      replaced_still_present: [{ path: 'docs/decisions/0002-b.md', replaces: '0001', still_present: ['docs/decisions/0001-a.md'] }],
      not_records: [],
    },
  });
  eq('recordsPrompt: the read list is the contract, the hygiene rules, AGENTS.md and every record — no other doc',
    ['/std/references/project-setup.md', '/std/../../references/writing-hygiene.md', '/repo/AGENTS.md',
      '/repo/docs/decisions/0001-a.md', '/repo/docs/decisions/0002-b.md'],
    [...recordsAsk.matchAll(/^ {2}(\/\S+)$/gm)].map((m) => m[1]));
  truthy('recordsPrompt: the agent reads once and does not open the code',
    recordsAsk.includes('ONE parallel batch of Read calls') && recordsAsk.includes('no Bash, no Grep, no Glob, no other Read') &&
    recordsAsk.includes('You do not open the code'));
  truthy('recordsPrompt: the contract is read from its block, not from memory',
    recordsAsk.includes('headed `docs/decisions/`') && recordsAsk.includes('from the file rather than memory'));
  truthy('recordsPrompt: every manifest fact reaches the agent as a finding to report',
    recordsAsk.includes('docs/decisions/0001-a.md: 11 lines under the heading') &&
    recordsAsk.includes('number 0002 is on docs/decisions/0002-b.md and docs/decisions/0002-c.md') &&
    recordsAsk.includes('docs/decisions/0002-b.md replaces 0001, and docs/decisions/0001-a.md is still in the tree'));
  eq('recordsPrompt: each record is asked the seven clauses of the contract, the set two, the route one',
    ['1. HEADING AND BODY', '2. ONE DECISION', '3. FORCE', '4. REJECTED', '5. EARNS A FILE', '6. READS ON ITS OWN',
      '7. NOT INSIDE', '8. CONFLICT', '9. TWICE', '10. Find that route'],
    [...recordsAsk.matchAll(/^ {2}(\d+\. (?:[A-Z ]+(?= —)|Find that route))/gm)].map((m) => m[1]));
  truthy('recordsPrompt: a conflict between two records names no winner',
    recordsAsk.includes("is the user's call") && recordsAsk.includes('recommend no winner'));
  // The manifest flags a MADR file in the tree on each status line and on its length; read
  // as a record, those flags ask for every ADR to be cut down to 8 lines.
  truthy('recordsPrompt: a record in another format is sent out of the tree, not cut down',
    recordsAsk.includes('Lifecycle, Route and Precedence lines') &&
    recordsAsk.includes('is misplaced, not a record to cut down') && recordsAsk.includes('skip questions 1 to 7 for it'));
  truthy('recordsPrompt: a record that misleads an agent that obeys it is major',
    /major: the record misleads[^\n]*two records in conflict[^\n]*a route that misses a path/.test(recordsAsk));
  const bare = recordsPrompt({ repoRoot: '/repo', setupFile: '/s', hygieneFile: '/h', records: recordTargets(recordFiles), hasAgents: false, privateLayout: false,
    tree: { flagged: [], duplicate_numbers: [], replaced_still_present: [], not_records: [] } });
  truthy('recordsPrompt: without manifest facts the block says none',
    bare.includes('count no lines yourself:\n  none\n'));
  truthy('recordsPrompt: a repo without AGENTS.md reads none and reports the missing route once',
    !bare.includes('/repo/AGENTS.md') && bare.includes('has no AGENTS.md'));

  // ── orderTargets ─────────────────────────────────────────────────────────────
  const ordered = orderTargets([
    { path: 'docs/specs/Z.md', classification: 'non-standard' },
    { path: 'docs/TESTING.md', classification: 'canonical' },
    { path: 'README.md', classification: 'canonical' },
    { path: 'docs/A.md', classification: 'non-standard' },
    { path: 'AGENTS.md', classification: 'canonical' },
    { path: 'docs/CODING.md', classification: 'canonical' },
    { path: 'CLAUDE.md', classification: 'canonical' },
  ]);
  // The router and the docs it routes to lead, so they tend to share a batch and one agent
  // sees both sides of a route.
  eq('orderTargets: steering files, then use cases in USE_CASES order, then the rest by path',
    ['AGENTS.md', 'README.md', 'docs/CODING.md', 'docs/TESTING.md', 'docs/A.md', 'docs/specs/Z.md'],
    ordered.map((t) => t.file.path));
  eq('orderTargets: a use-case doc carries its use case', 'coding',
    ordered.find((t) => t.file.path === 'docs/CODING.md').useCase.useCase);
  eq('orderTargets: every other file carries none', null,
    ordered.find((t) => t.file.path === 'docs/A.md').useCase);

  // ── packBatches ──────────────────────────────────────────────────────────────
  const sized = (path, bytes) => ({ file: { path, metrics: { bytes } }, useCase: null });
  const packed = packBatches([sized('a', 60), sized('b', 50), sized('c', 30), sized('d', 100)], 100);
  eq('packBatches: fills a batch until the next file would overflow it',
    [['a'], ['b', 'c'], ['d']], packed.map((b) => b.map((t) => t.file.path)));
  eq('packBatches: a file over the budget gets a batch of its own, not dropped',
    [['big'], ['s']], packBatches([sized('big', 500), sized('s', 1)], 100).map((b) => b.map((t) => t.file.path)));
  eq('packBatches: no targets means no batches', [], packBatches([], 100));
  // The measured repo this redesign was cut against: 45 docs, 470KB. One agent per file was
  // 39 agents; the whole point is a handful.
  const realistic = Array.from({ length: 45 }, (_, i) => sized(`d${i}`, Math.round(470000 / 45)));
  truthy('packBatches: a 45-doc, 470KB doc set needs at most five agents',
    packBatches(realistic, BATCH_BYTES).length <= 5, `got ${packBatches(realistic, BATCH_BYTES).length}`);

  // ── unreviewedFiles ──────────────────────────────────────────────────────────
  const twoBatches = [[sized('a', 1), sized('b', 1)], [sized('c', 1)]];
  eq('unreviewedFiles: a file its agent did not list is reported',
    ['b'], unreviewedFiles(twoBatches, [{ files_reviewed: ['a'] }, { files_reviewed: ['c'] }]));
  eq('unreviewedFiles: a dead batch agent reports its whole batch',
    ['c'], unreviewedFiles(twoBatches, [{ files_reviewed: ['a', 'b'] }, null]));
  eq('unreviewedFiles: a complete run reports nothing',
    [], unreviewedFiles(twoBatches, [{ files_reviewed: ['a', 'b'] }, { files_reviewed: ['c'] }]));

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
  // Drive the FULL manifest → read-review → history → synthesis pipeline through stubbed
  // hooks. Without this the orchestration block never executes, so a variable dropped from
  // its destructure would throw a ReferenceError only during a real multi-agent run while
  // every helper assertion above still passed.
  const metrics = { lines: 10, words: 50, non_heading_lines: 8, bytes: 400 };
  const manifest = {
    summary: { total_md: 5, canonical_missing: 0, unresolved_links: 0, orphans: 0, decision_record_facts: 0 },
    files: [
      { path: 'docs/CODING.md', classification: 'canonical', canonical_name: 'CODING.md', metrics },
      { path: 'AGENTS.md', classification: 'canonical-root', canonical_name: 'AGENTS.md', metrics },
      { path: 'README.md', classification: 'canonical-root', canonical_name: 'README.md', metrics },
      { path: 'docs/A.md', classification: 'non-standard', metrics },
      { path: '.claude.local.md', classification: 'personal-legacy', metrics },
    ],
    legacy_personal: [{ path: '.claude.local.md', rename_to: 'CLAUDE.local.md', rename_to_exists: true }],
    agents_routes: [
      { kind: 'file', target: 'docs/CODING.md', text: '**MUST read [docs/CODING.md](docs/CODING.md) before editing ANY file.**' },
      { kind: 'file', target: 'docs/B.md', text: 'See [docs/B.md](docs/B.md) for details.' },
    ],
    missing_canonical: [], orphans: [], location_violations: [], injected_blocks: [],
    decisions: { records: 0, flagged: [], duplicate_numbers: [], not_records: [], replaced_still_present: [] },
  };

  // The history stage's script output, stubbed at the two points it shells out.
  const promptIndex = {
    repo_root: '/repo', projects_dir: '/p', transcripts_found: 2, sessions_with_prompts: 2,
    batches: [{ file: '/tmp/sc/history/prompts-01.json', labels_file: '/tmp/sc/history/labels-01.json', sessions: 2, messages: 10 }],
    complete: true,
  };
  // history.py emits coverage and an evidence file for every use case.
  const evidence = {
    evidence_file: '/tmp/sc/history/evidence.json', sessions_scanned: 2, sessions_labelled: 2,
    evidence_files: Object.fromEntries(Object.keys(USE_CASES).map((u) => [u, `/tmp/sc/history/evidence-${u}.json`])),
    coverage: {
      ...Object.fromEntries(Object.keys(USE_CASES).map((u) => [u, { labelled: 0, valid: 0, examined: 0, excluded_route_changed: 0 }])),
      coding: { labelled: 6, valid: 4, examined: 6, excluded_route_changed: 2, historical_examined: 2 },
    },
    historical: {
      coding: [{ route_then: 'Load [docs/CODING.md](docs/CODING.md) for guidance.',
                 segments: 2, opened_doc: 0, did_work: 2 }],
    },
    complete: true,
  };

  const runAudit = async (over = {}) => {
    // promptIndex and manifest are stub overrides for the scripts, not workflow arguments.
    const { promptIndex: promptOverride, manifest: manifestOverride, evidence: evidenceOverride, labelWrite, dropFile, coveredBy, manifestRelays = [], evidenceCuts = 0, promptCuts = 0, ...argOver } = over;
    // manifest.py counts every file it lists; an override that adds files keeps that true.
    const base = manifestOverride || manifest;
    const manifestForRun = { ...base, summary: { ...base.summary, total_md: base.files.length } };
    const labels = [];
    const prompts = [];
    const calls = [];
    const agent = async (prompt, opts = {}) => {
      labels.push(opts.label);
      prompts.push(prompt);
      calls.push(opts);
      if (opts.label.startsWith('manifest')) {
        // The relays a model retyping the JSON has returned: cut short mid-string, cut short
        // with its brackets closed, or no reply at all from a skipped agent.
        const full = JSON.stringify(manifestForRun);
        const relay = manifestRelays[labels.filter((l) => l.startsWith('manifest')).length - 1];
        if (relay === 'cut') return full.slice(0, full.length - 20);
        if (relay === 'closed') return JSON.stringify({ ...manifestForRun, files: manifestForRun.files.slice(0, -1) });
        if (relay === 'null') return null;
        return '```json\n' + full + '\n```';
      }
      if (opts.label.startsWith('history:extract')) {
        const relayed = promptOverride || promptIndex;
        // A relay cut short and closed by the model: the last batch and the sentinel are gone.
        const cut = labels.filter((l) => l.startsWith('history:extract')).length <= promptCuts;
        const { complete, ...rest } = relayed;
        return JSON.stringify(cut ? { ...rest, batches: relayed.batches.slice(0, -1) } : relayed);
      }
      if (opts.label.startsWith('history:evidence')) {
        if (typeof evidenceOverride === 'string') return evidenceOverride;
        const relayed = evidenceOverride || evidence;
        // A relay cut short and closed by the model: the superseded-route buckets are gone.
        const cut = labels.filter((l) => l.startsWith('history:evidence')).length <= evidenceCuts;
        const { complete, ...rest } = relayed;
        return JSON.stringify(cut ? { ...rest, historical: {} } : relayed);
      }
      if (opts.label.startsWith('history:label-')) {
        return labelWrite || { labels_file: '/tmp/sc/history/labels-01.json', sessions_labelled: 2, messages_labelled: 10 };
      }
      if (opts.label === 'history:judge') {
        return { entries: [{
          use_case: 'coding', doc: 'docs/CODING.md', segments_judged: 4, routed: 1, late: 0,
          missed: 3, not_applicable: 0, route_wording: 'obligation', attribution: 'agent',
          severity: 'minor', finding: 'skipped despite a hard route',
        }] };
      }
      if (opts.label.startsWith('review-')) {
        // A doc batch names its files in FILE sections; the records agent has only a read list.
        const listed = opts.label === 'review-records'
          ? [...prompt.matchAll(/^ {2}\/repo\/(docs\/decisions\/\S+)$/gm)]
          : [...prompt.matchAll(/── FILE \d+: (\S+)/g)];
        const paths = listed.map((m) => m[1]).filter((p) => p !== dropFile);
        return { files_reviewed: paths, findings: [{ file: paths[0], category: 'accuracy', severity: 'major', observation: 'o', evidence: 'e', recommended_action: 'r', ...(coveredBy ? { covered_by: coveredBy } : {}) }] };
      }
      return { verdict: 'minor gaps', headline: 'h', findings: [] };
    };
    const { ret } = await load({
      agent,
      args: { repoRoot: '/repo', scriptsDir: '/s/scripts', standardDir: '/std', scratchDir: '/tmp/sc', ...argOver },
      log: () => {},
      phase: () => {},
      parallel: async (thunks) => Promise.all(thunks.map((t) => t())),
      pipeline: async () => { throw new Error('the workflow no longer pipelines'); },
    });
    return { ret, labels, prompts, calls };
  };

  const deep = await runAudit({ level: 'ultra' });
  const reviewPrompts = deep.prompts.filter((_, i) => deep.labels[i].startsWith('review-'));
  eq('orchestration: the report is returned', 'minor gaps', deep.ret && deep.ret.report && deep.ret.report.verdict);
  eq('orchestration: the level is echoed in raw', 'ultra', deep.ret && deep.ret.raw.level);
  eq('orchestration: the stages are manifest, read-review, history, synthesis — nothing else',
    ['manifest', 'review-1/1', 'history:extract', 'history:label-1', 'history:evidence', 'history:judge', 'synthesis'],
    deep.labels);

  // ── the cost bounds ──────────────────────────────────────────────────────────
  // An agent that omits model or effort inherits the session's, which may be opus at
  // xhigh. Every agent that thinks must name both, so the price of a run is the script's.
  eq('cost: every agent names its model',
    [], deep.calls.filter((c) => !c.model).map((c) => c.label));
  eq('cost: every agent above haiku names its effort',
    [], deep.calls.filter((c) => c.model !== 'haiku' && !c.effort).map((c) => c.label));
  eq('cost: the read-review uses the level model and effort',
    [['opus', 'xhigh']], deep.calls.filter((c) => c.label.startsWith('review-')).map((c) => [c.model, c.effort]));
  // The one rule that keeps a batch agent's turn count fixed. Losing it lets the agent
  // grep the code claim by claim, and every grep re-sends all it has read.
  truthy('cost: the batch agent reads its fixed list in one parallel batch and nothing else',
    reviewPrompts.length > 0 && reviewPrompts.every((p) =>
      p.includes('ONE parallel batch of Read calls') && p.includes('no Bash, no Grep, no Glob, no other Read')));
  truthy('cost: the batch agent does not check claims against the code',
    reviewPrompts.every((p) => p.includes('you do not open the code')));
  eq('cost: one history judge for every use case, not one per use case', 1,
    deep.labels.filter((l) => l === 'history:judge').length);
  // --brief: the full manifest of a 45-doc repo is 132KB, and the relaying agent's Bash tool
  // returns only a preview of that. Two runs died on the fragment.
  truthy('cost: the manifest is requested in its brief form',
    deep.prompts[0].includes('--brief'));

  // A model retyping the manifest has returned it cut short; one bad copy must not end the run.
  truthy('manifest: a failed copy is retried at least once', RELAY_ATTEMPTS > 1, `got ${RELAY_ATTEMPTS}`);
  const retried = await runAudit({
    manifestRelays: Array.from({ length: RELAY_ATTEMPTS - 1 }, (_, i) => (i % 2 ? 'closed' : 'cut')),
  });
  eq('manifest: a copy that does not parse is asked for again, up to the attempt limit',
    ['manifest', ...Array.from({ length: RELAY_ATTEMPTS - 1 }, (_, i) => `manifest-${i + 2}`)],
    retried.labels.filter((l) => l.startsWith('manifest')));
  eq('manifest: the run goes on once a copy parses', 'minor gaps',
    retried.ret && retried.ret.report && retried.ret.report.verdict);
  const exhausted = await runAudit({ manifestRelays: Array(RELAY_ATTEMPTS).fill('closed') });
  truthy('manifest: the run aborts once every attempt failed, and says how many',
    exhausted.ret && new RegExp(`manifest relay failed: no usable copy after ${RELAY_ATTEMPTS} attempts`).test(exhausted.ret.error || ''),
    `got ${JSON.stringify(exhausted.ret)}`);
  eq('manifest: no review agent runs on an aborted manifest', [],
    exhausted.labels.filter((l) => !l.startsWith('manifest')));
  // A skipped agent is the user stopping the run; starting another would overrule them.
  const skipped = await runAudit({ manifestRelays: ['null'] });
  eq('manifest: a skipped or dead agent ends the run without another attempt', ['manifest'], skipped.labels);
  truthy('manifest: the abort says the agent returned nothing, not that JSON failed to parse',
    skipped.ret && /returned nothing on attempt 1/.test(skipped.ret.error || ''), `got ${JSON.stringify(skipped.ret)}`);

  // ── read-review prompts ──────────────────────────────────────────────────────
  truthy('read-review: the repo root reaches the batch prompt',
    reviewPrompts[0].includes('Repo root: /repo'));
  truthy('read-review: every doc in the batch is on the read list by absolute path',
    ['/repo/docs/CODING.md', '/repo/AGENTS.md', '/repo/docs/A.md'].every((p) => reviewPrompts[0].includes(`  ${p}\n`)));
  truthy('read-review: the authoring rules and hygiene rules are on the read list',
    reviewPrompts[0].includes('/std/references/project-doc-guidelines.md') &&
    reviewPrompts[0].includes('/std/../../references/writing-hygiene.md'));
  // The contract text is no longer in the manifest, so the agent must read it itself.
  truthy('read-review: the ownership contracts are on the read list',
    reviewPrompts.every((p) => p.includes('  /std/references/project-setup.md\n')));
  truthy('read-review: a canonical file is sent to the contract block headed by its path',
    reviewPrompts[0].includes('headed `docs/CODING.md` in project-setup.md') &&
    reviewPrompts[0].includes('headed `AGENTS.md` in project-setup.md') &&
    reviewPrompts[0].includes('headed `README.md` in project-setup.md'));
  truthy('read-review: a contract line also names the topic-doc exclusions above the blocks',
    reviewPrompts[0].includes('the topic-doc exclusions stated above the blocks'));
  truthy('read-review: the standard says a non-standard doc has no contract block',
    reviewPrompts[0].includes('a NON-STANDARD doc has none'));
  truthy('read-review: a non-standard file is judged for placement, not against a contract',
    reviewPrompts[0].includes('NON-STANDARD doc') && !reviewPrompts[0].includes('headed `docs/A.md`'));
  truthy('read-review: the use-case doc is judged as doing the work, not auditing a file',
    reviewPrompts[0].includes('arrives wanting to create or edit a file in the source tree'));
  truthy('read-review: the route wording reaches the use-case section',
    reviewPrompts[0].includes('MUST read [docs/CODING.md]'));
  truthy('read-review: the severity bar reaches the batch agent',
    reviewPrompts[0].includes('SEVERITY — assign every finding'));
  truthy('read-review: AGENTS.md is judged for trigger edge without needing transcripts',
    reviewPrompts[0].includes('TRIGGER EDGE') && reviewPrompts[0].includes('is there a single, recognizable instant'));
  truthy('read-review: the AGENTS.md section carries both a sharp and an edgeless example',
    reviewPrompts[0].includes('before ANY git operation') && reviewPrompts[0].includes('before searching this repository'));
  truthy('read-review: the non-standard doc is judged for placement',
    reviewPrompts[0].includes('NON-STANDARD doc'));
  truthy('read-review: a misplaced decision record is judged for placement, with the registered home exempt',
    reviewPrompts[0].includes('DECISION RECORD PLACEMENT') &&
    reviewPrompts[0].includes('One outside whose folder docs/DOCUMENTING.md registers is filed correctly'));
  eq('read-review: the placement rules are stated once per batch, not per non-standard doc',
    1, reviewPrompts[0].split('DECISION RECORD PLACEMENT —').length - 1);
  eq('read-review: findings reach raw', 1, deep.ret.raw.read_findings.length);
  eq('read-review: the batches are reported', [['AGENTS.md', 'README.md', 'docs/CODING.md', 'docs/A.md']], deep.ret.raw.review_batches);
  eq('read-review: a complete run reports no unreviewed file', [], deep.ret.raw.not_reviewed);

  truthy('history: a complete classification reports no failure to the synthesis',
    deep.prompts[deep.prompts.length - 1].includes('History stage failure: none'));
  // A label agent can report counts for a file it never wrote. Only history.py's count shows
  // it, and without the comparison the report reads the failure as a repository with no sessions.
  const unwritten = await runAudit({ evidence: { ...evidence, sessions_labelled: 0 } });
  truthy('history: labels the agents claimed but history.py did not read reach the synthesis as a failure',
    unwritten.prompts[unwritten.prompts.length - 1].includes(
      'History stage failure: history.py read labels for 0 of the 2 session(s) sent to the label agents, which reported 2'));
  // An agent that saw its write fail reports 0, as told. Measured against the agents' own
  // counts, that failure would match history.py's 0 and pass as a full classification.
  const reportedFailure = await runAudit({
    evidence: { ...evidence, sessions_labelled: 0 },
    labelWrite: { labels_file: '/tmp/sc/history/labels-01.json', sessions_labelled: 0, notes: 'permission denied' },
  });
  truthy('history: a write the label agent reported as failed reaches the synthesis as a failure, with its error',
    reportedFailure.prompts[reportedFailure.prompts.length - 1].includes(
      'History stage failure: history.py read labels for 0 of the 2 session(s) sent to the label agents, which reported 0: the label files are missing or incomplete (permission denied)'));
  const unparsed = await runAudit({ evidence: 'Traceback (most recent call last):' });
  truthy('history: an evidence summary that does not parse reaches the synthesis as a failure',
    unparsed.prompts[unparsed.prompts.length - 1].includes(
      `History stage failure: the evidence summary from history.py: no usable copy after ${RELAY_ATTEMPTS} attempts`));
  const evidenceRetried = await runAudit({ evidenceCuts: RELAY_ATTEMPTS - 1 });
  eq('history: an incomplete evidence summary is asked for again',
    ['history:evidence', ...Array.from({ length: RELAY_ATTEMPTS - 1 }, (_, i) => `history:evidence-${i + 2}`)],
    evidenceRetried.labels.filter((l) => l.startsWith('history:evidence')));
  eq('history: the stage goes on once a copy is complete', 4,
    evidenceRetried.ret && evidenceRetried.ret.raw.history_coverage.coding.valid);
  const promptRetried = await runAudit({ promptCuts: RELAY_ATTEMPTS - 1 });
  eq('history: an incomplete prompt index is asked for again',
    ['history:extract', ...Array.from({ length: RELAY_ATTEMPTS - 1 }, (_, i) => `history:extract-${i + 2}`)],
    promptRetried.labels.filter((l) => l.startsWith('history:extract')));
  eq('history: the label agents run on the complete copy, one per batch', ['history:label-1'],
    promptRetried.labels.filter((l) => l.startsWith('history:label-')));
  truthy('history: the label agent writes with the Write tool',
    deep.prompts.some((p, i) => deep.labels[i].startsWith('history:label-') && p.includes('with the Write tool')));

  const partial = await runAudit({ dropFile: 'docs/A.md' });
  eq('read-review: a file the agent did not review is reported in raw', ['docs/A.md'], partial.ret.raw.not_reviewed);
  truthy('read-review: and the synthesis is told about it',
    partial.prompts[partial.prompts.length - 1].includes('Files the read-review did not cover: ["docs/A.md"]'));

  // ── recorded doc decisions (docs/DOCUMENTING.md) ─────────────────────────────
  // The decisions are freeform prose, so the workflow hands the agents the file rather than
  // extracting anything. Two things must hold: the block only appears where the repo has
  // the file, and it scopes the suppression to gap and declined findings — a project may
  // decide not to document something, or to keep content where it is, never that a false
  // statement is true.
  truthy('decisions: no DOCUMENTING.md in the repo means no decisions block anywhere',
    !deep.prompts.some((p) => p.includes('RECORDED DOC DECISIONS')));
  truthy('decisions: without the file the synthesis makes no tool calls',
    deep.prompts[deep.prompts.length - 1].includes('make no tool calls'));

  const withDoc = await runAudit({
    manifest: {
      ...manifest,
      files: [...manifest.files, { path: 'docs/DOCUMENTING.md', classification: 'canonical', canonical_name: 'DOCUMENTING.md', metrics }],
    },
  });
  const withDocReview = withDoc.prompts.filter((_, i) => withDoc.labels[i].startsWith('review-'));
  truthy('decisions: docs/DOCUMENTING.md is reviewed as the documenting use case',
    withDocReview.some((p) => p.includes('Use case "documenting"')));
  truthy('decisions: a batch that holds docs/DOCUMENTING.md lists it once',
    withDocReview.every((p) => p.split('  /repo/docs/DOCUMENTING.md\n').length - 1 === 1));
  truthy('decisions: every batch agent reads it',
    withDocReview.every((p) => p.includes('RECORDED DOC DECISIONS') && p.includes('/repo/docs/DOCUMENTING.md')));
  truthy('decisions: the synthesis stage gets the decisions too',
    withDoc.prompts.some((p) => p.includes('RECORDED DOC DECISIONS') && p.includes('cross_file_notes')));
  const decisionsBlocks = withDoc.prompts.filter((p) => p.includes('RECORDED DOC DECISIONS'));
  truthy('decisions: the suppression is scoped to gap and declined findings, in every stage',
    decisionsBlocks.every((p) => /DECLINED finding/.test(p) && /settles? nothing else/.test(p)
      && /stays a finding at full severity/.test(p)));

  // A batch agent that drops a settled finding itself leaves the report no trace of it, so
  // a decision that no longer fits the doc is never seen. It returns the finding marked
  // instead, and the synthesis stage, the only one that writes cross_file_notes, drops it.
  truthy('decisions: a batch agent returns a settled finding with covered_by, not omits it',
    withDocReview.every((p) => /Return a settled finding all the same, with covered_by/.test(p)));
  const covered = await runAudit({
    manifest: {
      ...manifest,
      files: [...manifest.files, { path: 'docs/DOCUMENTING.md', classification: 'canonical', canonical_name: 'DOCUMENTING.md', metrics }],
    },
    coveredBy: 'docs/OVERVIEW.md keeps the module tree',
  });
  const coveredSynth = covered.prompts[covered.labels.indexOf('synthesis')];
  truthy('decisions: a covered_by finding reaches the synthesis stage with its decision',
    coveredSynth.includes('"covered_by":"docs/OVERVIEW.md keeps the module tree"'));
  truthy('decisions: the synthesis stage drops a covered_by finding only where the decision settles it',
    /covered_by[^\n]*drop it where that decision does settle it, and keep it/.test(coveredSynth));
  truthy('decisions: FINDINGS_SCHEMA carries covered_by',
    covered.calls.some((c) => c.schema && c.schema.properties.findings
      && c.schema.properties.findings.items.properties.covered_by));

  // ── history ──────────────────────────────────────────────────────────────────
  const judgePrompt = deep.prompts[deep.labels.indexOf('history:judge')];
  truthy('history: the extract step runs before any classification',
    deep.labels.indexOf('history:extract') < deep.labels.indexOf('history:label-1'));
  eq('history: one classifier per prompt batch', 1, deep.labels.filter((l) => l.startsWith('history:label-')).length);
  truthy('history: the judge reads the per-use-case evidence file',
    judgePrompt.includes('/tmp/sc/history/evidence-coding.json'));
  truthy('history: only use cases with valid evidence are judged',
    judgePrompt.includes('use_case "coding"') && !judgePrompt.includes('use_case "testing"'));
  eq('history: verdicts reach raw', 4, deep.ret && deep.ret.raw.history[0].segments_judged);
  eq('history: coverage reaches raw', 4, deep.ret && deep.ret.raw.history_coverage.coding.valid);

  // ── the decision records ─────────────────────────────────────────────────────
  // One agent holds the whole set and nothing else; the doc batches read the records as
  // context, so a doc that states the opposite of a record is seen in whatever batch it sits.
  const treeFacts = { ...manifest.decisions, records: 2,
    flagged: [{ path: 'docs/decisions/0002-b.md', flags: ['line 3 is a status or date line'] }] };
  const tree = await runAudit({
    level: 'ultra',
    manifest: {
      ...manifest,
      summary: { ...manifest.summary, decision_record_facts: 1 },
      decisions: treeFacts,
      files: [...manifest.files,
        { path: 'docs/decisions/0001-a.md', classification: 'decision', canonical_name: 'decisions/', metrics,
          unresolved_links: [{ line: 4, ref: '../GONE.md', reason: 'file not found' }] },
        { path: 'docs/decisions/0002-b.md', classification: 'decision', canonical_name: 'decisions/', metrics }],
    },
  });
  eq('records: one more read-review agent, after the doc batches',
    ['review-1/1', 'review-records'], tree.labels.filter((l) => l.startsWith('review-')));
  eq('records: that agent runs at the level model and effort',
    ['opus', 'xhigh'], tree.calls.filter((c) => c.label === 'review-records').map((c) => [c.model, c.effort])[0]);
  const recordsRun = tree.prompts[tree.labels.indexOf('review-records')];
  const docRun = tree.prompts[tree.labels.indexOf('review-1/1')];
  truthy('records: the records agent gets the manifest facts',
    recordsRun.includes('docs/decisions/0002-b.md: line 3 is a status or date line'));
  // A record has no FILE section in a doc batch, so its dead links reach a finding only here.
  truthy('records: a dead link in a record reaches the records agent as a fact',
    recordsRun.includes('docs/decisions/0001-a.md: line 4, the link ../GONE.md does not resolve (file not found)'));
  truthy('records: the records agent may read a file too large for one Read in parts',
    recordsRun.includes('read that file in parts with offset and limit'));
  truthy('records: the records agent reads no other doc of the repository',
    !recordsRun.includes('/repo/docs/CODING.md') && !recordsRun.includes('/repo/README.md'));
  truthy('records: a doc batch has no section for a record',
    !/── FILE \d+: docs\/decisions\//.test(docRun));
  truthy('records: a doc batch reads the records as context and leaves their wording to the records agent',
    docRun.includes('  /repo/docs/decisions/0001-a.md\n') && docRun.includes('DECISIONS IN FORCE') &&
    docRun.includes("file no finding on a record's own wording"));
  truthy('records: a doc that states the opposite of a record is a finding that names no winner',
    docRun.includes('leave open which side holds the decision in force'));
  eq('records: the records are reported as a batch of their own',
    ['docs/decisions/0001-a.md', 'docs/decisions/0002-b.md'], tree.ret.raw.review_batches[1]);
  eq('records: a complete run reports no unreviewed record', [], tree.ret.raw.not_reviewed);
  const lostRecord = await runAudit({
    dropFile: 'docs/decisions/0002-b.md',
    manifest: { ...manifest, files: [...manifest.files,
      { path: 'docs/decisions/0001-a.md', classification: 'decision', canonical_name: 'decisions/', metrics },
      { path: 'docs/decisions/0002-b.md', classification: 'decision', canonical_name: 'decisions/', metrics }] },
  });
  eq('records: a record the agent did not judge is reported by name', ['docs/decisions/0002-b.md'], lostRecord.ret.raw.not_reviewed);
  truthy('records: a repo without records gets no records agent and no context block',
    !deep.labels.includes('review-records') && !reviewPrompts[0].includes('DECISIONS IN FORCE'));
  const treeSynthesis = tree.prompts[tree.prompts.length - 1];
  truthy('records: the synthesis gets the shape and tree facts, and raises one no finding carries',
    treeSynthesis.includes(`shape and tree facts: ${JSON.stringify(treeFacts)}`) &&
    treeSynthesis.includes('Every decision-record fact listed above that no read-review finding carries is a finding too') &&
    treeSynthesis.includes('deletes it and repoints every citation of it in the same change'));
  truthy('records: a record set against itself, another record or a doc is open, never settled for the record',
    treeSynthesis.includes('OPEN sets a decision record against itself, another record or another doc') &&
    treeSynthesis.includes('being a record does not make it the right side'));
  truthy('records: a record that contradicts itself or another record stays major or above',
    treeSynthesis.includes('a record contradicts itself, another record or another doc stays at major or above'));
  eq('records: a set under the context budget is read by the doc batches, and raw says so', true, tree.ret.raw.records_as_context);
  truthy('records: under the budget the synthesis is told of no unchecked conflict',
    !treeSynthesis.includes('was not checked this run'));

  // Long records in another format would multiply what every doc batch reads: over the
  // budget the batches go without them, and the report says what that leaves unchecked.
  const bigRecord = (n) => ({ path: `docs/decisions/000${n}-long.md`, classification: 'decision', canonical_name: 'decisions/',
    metrics: { ...metrics, bytes: Math.ceil(RECORDS_CONTEXT_BYTES / 2) + 1 } });
  const overBudget = await runAudit({ manifest: { ...manifest, files: [...manifest.files, bigRecord(1), bigRecord(2)] } });
  const overDoc = overBudget.prompts[overBudget.labels.indexOf('review-1/1')];
  truthy('records: over the context budget no doc batch reads a record or gets the context block',
    !overDoc.includes('/repo/docs/decisions/') && !overDoc.includes('DECISIONS IN FORCE'));
  truthy('records: over the budget the records agent still judges the whole set',
    overBudget.labels.includes('review-records') &&
    overBudget.prompts[overBudget.labels.indexOf('review-records')].includes('  /repo/docs/decisions/0002-long.md\n'));
  eq('records: over the budget raw says the doc batches went without them', false, overBudget.ret.raw.records_as_context);
  truthy('records: over the budget the synthesis states that a doc against a record went unchecked',
    overBudget.prompts[overBudget.prompts.length - 1].includes('a doc that states the opposite of a record was not checked this run'));
  truthy('history: the judge is told AGENTS.md is never Read, so its absence proves nothing',
    judgePrompt.includes('AGENTS.md is always in an agent') && judgePrompt.includes('never Read'));
  truthy('history: a well-edged obligation route that is skipped accuses the agent, not the doc',
    judgePrompt.includes('obligation route WITH a recognizable edge + misses => attribution "agent"'));
  truthy('history: an advisory or edgeless route that is skipped accuses the doc',
    judgePrompt.includes('advisory, edgeless, or absent route + misses => attribution "doc"'));
  // A route can satisfy every written rule and still be unfollowable, because naming an
  // action is not the same as there being a moment the agent notices crossing it. Without
  // this the case is indistinguishable from laziness and is blamed on the agent forever.
  truthy('history: the judge must locate the turn the trigger fired',
    judgePrompt.includes('TRIGGER EDGE') && judgePrompt.includes('find the exact turn at which the route'));
  truthy('history: an edgeless MUST is treated as advisory, not as a correct route',
    judgePrompt.includes('Set route_wording to "advisory" for an edgeless trigger even when it is phrased as a MUST'));
  truthy('history: the judge is told a miss never proves the doc redundant',
    judgePrompt.includes('could not know what the doc contained before opening it'));

  // Evidence about a superseded route is not evidence about today's text — but it is
  // what shows whether a rewrite was warranted, so it is reported rather than dropped.
  truthy('history: the judge is told to report superseded-route evidence',
    judgePrompt.includes('SUPERSEDED ROUTES') && judgePrompt.includes('historical_note'));
  truthy('history: superseded evidence may never move severity or attribution',
    judgePrompt.includes('NEVER a finding about the current text and must not move severity'));
  truthy('synthesis: superseded-route evidence reaches the report',
    deep.prompts.some((p) => p.includes('Superseded-route evidence') && p.includes('Load [docs/CODING.md]')));
  truthy('synthesis: is told to report it without letting it change a verdict',
    deep.prompts.some((p) => p.includes('never drop it either')));
  // The review no longer checks the docs against the code. A report that did not say so
  // would read as a clean bill of health for docs nobody compared with the code.
  truthy('synthesis: the report must say the docs were not checked against the code',
    deep.prompts[deep.prompts.length - 1].includes('did not check documented commands, paths, or flags against the code'));
  // A personal file under the old name is personal content: the only finding is its move,
  // which the user makes, and which must neither overwrite notes nor expose them to a commit.
  const synthesisPrompt = deep.prompts[deep.prompts.length - 1];
  truthy('synthesis: a personal file under a name Claude Code never loads reaches the report with its rename',
    synthesisPrompt.includes('{"path":".claude.local.md","rename_to":"CLAUDE.local.md","rename_to_exists":true}') &&
    synthesisPrompt.includes('the fix moves its content to its rename_to path'));
  truthy('synthesis: the move merges where the target exists and keeps the target gitignored',
    synthesisPrompt.includes('merged into that file where rename_to_exists is true') &&
    synthesisPrompt.includes('adds rename_to to .gitignore'));
  truthy('synthesis: moving a personal file is an open finding',
    synthesisPrompt.includes('moves a personal file (the user edits those'));
  truthy('read-review: a personal file under the old name is never read-reviewed',
    !deep.prompts.slice(0, -1).some((p) => p.includes('.claude.local.md')));

  const medium = await runAudit({ level: 'medium' });
  truthy('history: medium clears the finding floor, so a finding is allowed',
    medium.prompts.some((p) => p.includes('a finding is allowed')));
  eq('cost: medium reviews with opus at medium effort',
    [['opus', 'medium']], medium.calls.filter((c) => c.label.startsWith('review-')).map((c) => [c.model, c.effort]));

  const low = await runAudit({ level: 'low' });
  eq('orchestration: low still read-reviews and reports', 'minor gaps',
    low.ret && low.ret.report && low.ret.report.verdict);
  truthy('history: low is held to coverage-only, below the finding floor',
    low.prompts.some((p) => p.includes('Do not raise a finding from this sample')));

  // A repo nobody has opened in Claude Code has no transcripts. That is a gap in the
  // audit, not a defect in the docs — the stage must skip rather than invent evidence.
  const noHistory = await runAudit({
    level: 'medium', promptIndex: { projects_dir: '/p', sessions_with_prompts: 0, batches: [], complete: true },
  });
  eq('history: an empty prompt index is taken on the first relay', ['history:extract'],
    noHistory.labels.filter((l) => l.startsWith('history:extract')));
  truthy('history: no transcripts is a skip, not a failure',
    noHistory.prompts[noHistory.prompts.length - 1].includes('History stage failure: none'));
  eq('history: no transcripts means no classifier runs', 0,
    noHistory.labels.filter((l) => l.startsWith('history:label-')).length);
  eq('history: no transcripts means no judge runs', 0,
    noHistory.labels.filter((l) => l === 'history:judge').length);
  eq('history: the audit still completes and reports', 'minor gaps',
    noHistory.ret && noHistory.ret.report && noHistory.ret.report.verdict);

  // An unparseable manifest must abort with its own error, not proceed on garbage.
  const { ret: badManifest } = await load({
    agent: async (_p, o) => (o.label.startsWith('manifest') ? 'no json here' : null),
    args: { repoRoot: '/repo', scriptsDir: '/s/scripts', standardDir: '/std', scratchDir: '/tmp/sc' },
    log: () => {},
    phase: () => {},
    parallel: async (thunks) => Promise.all(thunks.map((t) => t())),
    pipeline: async () => [],
  });
  truthy('orchestration: an unparseable manifest aborts loudly',
    badManifest && /manifest relay failed/.test(badManifest.error || ''), `got ${JSON.stringify(badManifest)}`);

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
