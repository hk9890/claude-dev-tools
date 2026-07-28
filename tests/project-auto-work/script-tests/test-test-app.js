'use strict';
// test-test-app.js — unit tests for the pure helpers and the loop control flow in
// plugins/project-auto-work/skills/test-app/workflows/test-app.js.
//
// test-app.js is a Workflow-tool script: it begins with `export const meta` (ESM syntax)
// and uses top-level `await`/`return`, so stock require()/import() cannot load it. We strip
// the lone `export ` keyword and run the body inside an async-function wrapper — the same
// shape the Workflow runtime uses. The script assigns module.exports before its
// orchestration block, so the helpers are reachable whichever path that takes.
//
// This matters more here than in any sibling workflow: the only other way to exercise this
// control flow is a real run, and a real run launches the user's application and uses it
// for real — creating, changing and deleting live data. Every branch below is therefore
// driven through stubbed agent hooks.
//
// Coverage:
//   - normalizeArgs parses a JSON-*string* args payload and rejects an unusable config
//     before anything launches an application
//   - the level vocabulary shared with test-tests and the project-review skills, and the
//     dials — including ultra being a REAL rung here (it re-runs the app to confirm)
//   - reconAbort's GATE ORDERING — an unlaunchable app must not be reported as a focus
//     mismatch, or the user fixes the wrong thing
//   - composeBatch puts analyst leads ahead of the remaining plan
//   - isDry treats a dead analyst as unknown, never as quiet
//   - evidenceBasis / stampBasis: the surface-only caveat cannot be dropped from a headline
//   - the loop: ceiling, dry early-exit, leads becoming assigned flows, a driver that
//     cannot launch, and the janitor that follows it
//   - the bad-args bailout returns the diagnostic error object without spawning agents
//   - a broken runtime (no agent hook) fails loudly instead of no-op

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = path.resolve(
  __dirname,
  '../../../plugins/project-auto-work/skills/test-app/workflows/test-app.js'
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

// A recon result that trips no abort gate. Each gate test spreads one bad field over it.
const healthyRecon = (flows = 12) => ({
  app_summary: 'a file-based task tracker driven from the command line',
  docs_read: 'README.md, docs/RUNNING.md',
  launch_contract: {
    start_cmd: 'taskmgr list',
    ready_check: 'the process exits',
    teardown_cmd: 'none needed',
    source: 'README.md',
    complete: true,
  },
  monitoring_contract: {
    available: true,
    source_doc: 'docs/MONITORING.md',
    sources: [{ name: 'session log', how_to_read: 'cat .tasks/log', live_only: false }],
  },
  flow_inventory: Array.from({ length: flows }, (_, i) => ({
    area: `area-${i + 1}`,
    exercise: `exercise thing ${i + 1}`,
    expectation: `it should do thing ${i + 1}`,
    doc_source: 'README.md',
  })),
  focus_map: { in_scope_ids: Array.from({ length: flows }, (_, i) => i), focus_understood: 'broad' },
});

async function main() {
  let agentCalled = false;
  const { exports: helpers, ret } = await load({
    agent: () => { agentCalled = true; throw new Error('agent must not be called on the bad-args path'); },
    args: '{}',
    log: () => {},
    phase: () => { throw new Error('phase must not be called on the bad-args path'); },
  });

  const {
    normalizeArgs, dialFor, reconAbort, composeBatch, leadId, isDry,
    evidenceBasis, stampBasis, notCheckedList, unreachedReason,
    buildDrift, isUsableMarkdown, renderFallbackMarkdown,
    DIALS, DRY_LIMIT, AGGRESSION_BRIEF,
  } = helpers;

  const required = {
    normalizeArgs, dialFor, reconAbort, composeBatch, leadId, isDry,
    evidenceBasis, stampBasis, notCheckedList, unreachedReason,
    buildDrift, isUsableMarkdown, renderFallbackMarkdown,
  };
  const missingExport = Object.keys(required).filter((k) => typeof required[k] !== 'function');
  if (missingExport.length) {
    bad('test-app.js exposes its pure helpers', `missing or not a function: ${missingExport.join(', ')}`);
    console.log(`\nResults: ${pass} passed, ${fail} failed`);
    process.exit(1);
  }
  ok('test-app.js exposes its pure helpers');

  // ── normalizeArgs ────────────────────────────────────────────────────────────
  const good = normalizeArgs({ repoRoot: '/r', referencesDir: '/s/references' });
  eq('normalizeArgs: a valid config carries no error', null, good.error);
  eq('normalizeArgs: level defaults to medium', 'medium', good.level);
  eq('normalizeArgs: an absent focus is empty, not an error', '', good.focus);
  truthy('normalizeArgs: break-it.md resolves under referencesDir',
    good.breakItFile === '/s/references/break-it.md', good.breakItFile);
  eq('normalizeArgs: a trailing slash on referencesDir does not double the separator',
    good.breakItFile, normalizeArgs({ repoRoot: '/r', referencesDir: '/s/references/' }).breakItFile);
  eq('normalizeArgs: the focus is trimmed', 'the export feature',
    normalizeArgs({ repoRoot: '/r', referencesDir: '/s', focus: '  the export feature  ' }).focus);

  // The regression the seam exists for: args arriving as a JSON STRING must be parsed.
  eq('normalizeArgs: JSON-string payload is parsed', '/parsed/root',
    normalizeArgs('{"repoRoot":"/parsed/root","referencesDir":"/s"}').repoRoot);

  truthy('normalizeArgs: a missing repoRoot is rejected',
    /repoRoot and referencesDir/.test(normalizeArgs({ referencesDir: '/s' }).error || ''));
  truthy('normalizeArgs: a missing referencesDir is rejected',
    /repoRoot and referencesDir/.test(normalizeArgs({ repoRoot: '/r' }).error || ''));
  truthy('normalizeArgs: non-JSON string is rejected', normalizeArgs('not json').error);
  truthy('normalizeArgs: undefined is rejected', normalizeArgs(undefined).error);

  // An unsubstituted "<…>" placeholder from the SKILL.md args template is a NON-EMPTY
  // string, so a truthiness check passes it through — and agents cd into repoRoot and
  // launch the user's application from it.
  truthy('normalizeArgs: an unsubstituted placeholder repoRoot is rejected before any launch',
    /absolute path/.test(normalizeArgs({ repoRoot: '<path>', referencesDir: '/s' }).error || ''));
  truthy('normalizeArgs: a relative repoRoot is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: 'some/dir', referencesDir: '/s' }).error || ''));
  truthy('normalizeArgs: a relative referencesDir is rejected',
    /absolute path/.test(normalizeArgs({ repoRoot: '/r', referencesDir: 'rel/refs' }).error || ''));
  truthy('normalizeArgs: a relative scratchDir is rejected before any evidence is written',
    /absolute path/.test(normalizeArgs({ repoRoot: '/r', referencesDir: '/s', scratchDir: '<SCRATCH>' }).error || ''));
  eq('normalizeArgs: an absolute scratchDir is accepted', null,
    normalizeArgs({ repoRoot: '/r', referencesDir: '/s', scratchDir: '/tmp/x' }).error);
  eq('normalizeArgs: the received keys are echoed for diagnosis',
    ['repoRoot', 'references_dir'], normalizeArgs({ repoRoot: '/r', references_dir: '/s' }).receivedKeys);

  // ── the shared level vocabulary and its dials ────────────────────────────────
  for (const lvl of ['low', 'medium', 'high', 'ultra']) {
    eq(`level: ${lvl} is accepted`, lvl, normalizeArgs({ repoRoot: '/r', referencesDir: '/s', level: lvl }).level);
  }
  eq('level: an unknown token falls back to medium', 'medium',
    normalizeArgs({ repoRoot: '/r', referencesDir: '/s', level: 'turbo' }).level);
  eq('level: is case-insensitive', 'high',
    normalizeArgs({ repoRoot: '/r', referencesDir: '/s', level: 'HIGH' }).level);

  // Unlike test-tests — where ultra is an alias for high — ultra is a real rung here: it is
  // the only one that runs the application a second time to confirm a finding.
  eq('dials: the repro-confirm pass runs at ultra only',
    [false, false, false, true], ['low', 'medium', 'high', 'ultra'].map((l) => dialFor(l).confirm));
  eq('dials: low stays on documented happy paths', 'happy-path', dialFor('low').aggression);
  eq('dials: the iteration ceiling grows with the level',
    [2, 4, 8, 8], ['low', 'medium', 'high', 'ultra'].map((l) => dialFor(l).ceiling));
  eq('dials: an unknown level falls back to the medium dials', DIALS.medium, dialFor('turbo'));
  eq('dials: the level in the config selects the dial',
    DIALS.ultra, normalizeArgs({ repoRoot: '/r', referencesDir: '/s', level: 'ultra' }).dial);
  eq('dials: every aggression rung has a brief the driver can act on',
    [], Object.values(DIALS).map((d) => d.aggression).filter((a) => !AGGRESSION_BRIEF[a]));

  // ── reconAbort ───────────────────────────────────────────────────────────────
  eq('reconAbort: a documented app with a matched focus proceeds', null,
    reconAbort(healthyRecon(), 'area-1'));
  eq('reconAbort: a documented app with no focus proceeds', null, reconAbort(healthyRecon(), ''));

  const noLaunch = reconAbort(
    { ...healthyRecon(), launch_contract: { complete: false, missing: 'no start command anywhere' } }, '');
  truthy('reconAbort: an undocumented launch stops the run',
    noLaunch && /does not document how to run/.test(noLaunch.reason), `got ${noLaunch && noLaunch.reason}`);
  truthy('reconAbort: the launch abort names what is missing',
    noLaunch && noLaunch.evidence.includes('no start command anywhere'));
  truthy('reconAbort: the launch abort refuses to guess and says so',
    noLaunch && /never guesses/.test(noLaunch.remediation));

  // THE ordering regression: an app that cannot be launched cannot be tested under ANY
  // focus. Evaluated in the wrong order, an unlaunchable app with an unmatched focus would
  // send the user to rename their focus instead of documenting how to start the thing.
  const both = reconAbort({
    ...healthyRecon(),
    launch_contract: { complete: false, missing: 'no start command' },
    focus_map: { in_scope_ids: [] },
  }, 'billing');
  truthy('reconAbort: an unlaunchable app reports the launch gate, not the focus (gate ordering)',
    both && /does not document how to run/.test(both.reason), `got ${both && both.reason}`);

  const noFocus = reconAbort({ ...healthyRecon(3), focus_map: { in_scope_ids: [], unmatched_reason: 'no billing here' } }, 'billing');
  truthy('reconAbort: a focus matching nothing stops the run',
    noFocus && /focus does not match/.test(noFocus.reason), `got ${noFocus && noFocus.reason}`);
  truthy('reconAbort: the focus abort lists the areas that DO exist',
    noFocus && noFocus.evidence.includes('area-1') && noFocus.evidence.includes('area-3'));
  // Testing the wrong area is worse than not testing: the run mutates a live environment.
  truthy('reconAbort: the focus abort says why guessing a near-match was refused',
    noFocus && /wrong part of your environment/.test(noFocus.remediation));

  // An empty in_scope_ids with NO focus means "everything", not "nothing" — aborting there
  // would make the no-argument form of the skill unusable.
  eq('reconAbort: an empty scope with no focus is not a mismatch', null,
    reconAbort({ ...healthyRecon(), focus_map: { in_scope_ids: [] } }, ''));

  // ── composeBatch ─────────────────────────────────────────────────────────────
  const inv = [
    { id: 'flow-1', origin: 'recon' },
    { id: 'flow-2', origin: 'recon' },
    { id: 'flow-3', origin: 'recon' },
    { id: 'lead-1-1', origin: 'lead' },
  ];
  eq('composeBatch: a lead is planned ahead of the untouched plan',
    ['lead-1-1', 'flow-1'], composeBatch(inv, [], 2).map((f) => f.id));
  eq('composeBatch: already-exercised flows are never re-assigned',
    ['lead-1-1', 'flow-3'], composeBatch(inv, ['flow-1', 'flow-2'], 2).map((f) => f.id));
  eq('composeBatch: the batch is capped at the level\'s flows-per-iteration',
    2, composeBatch(inv, [], 2).length);
  eq('composeBatch: an exhausted inventory yields an empty batch',
    [], composeBatch(inv, ['flow-1', 'flow-2', 'flow-3', 'lead-1-1'], 3));
  eq('leadId: lead ids are deterministic', 'lead-2-3', leadId(2, 2));

  // ── isDry ────────────────────────────────────────────────────────────────────
  eq('isDry: an iteration with nothing new is dry', true, isDry({ findings: [], questions: [], leads: [] }));
  eq('isDry: a finding is not dry', false, isDry({ findings: [{}], questions: [], leads: [] }));
  eq('isDry: a question alone is not dry', false, isDry({ findings: [], questions: [{}], leads: [] }));
  eq('isDry: a lead alone is not dry', false, isDry({ findings: [], questions: [], leads: [{}] }));
  // A dead analyst produced no evidence of quiet. Counting it as dry would end the run
  // early on an agent failure and report the app as having gone silent.
  eq('isDry: a failed analyst is not evidence of quiet', false, isDry(null));

  // ── evidence basis and the headline cap ──────────────────────────────────────
  eq('evidenceBasis: a documented monitoring source backs the evidence', 'monitoring-backed',
    evidenceBasis({ available: true, sources: [{ name: 'log' }] }));
  eq('evidenceBasis: no monitoring contract means surface-only', 'surface-only',
    evidenceBasis({ available: false }));
  // available=true with an empty source list is a contract that names nothing readable.
  eq('evidenceBasis: an empty source list is surface-only', 'surface-only',
    evidenceBasis({ available: true, sources: [] }));
  eq('evidenceBasis: a missing contract object is surface-only', 'surface-only', evidenceBasis(null));

  truthy('stampBasis: a surface-only headline gains the caveat',
    /surface-only/.test(stampBasis({ headline: 'Nothing broke' }, 'surface-only').headline));
  eq('stampBasis: a headline that already says it is not doubled',
    'Clean, but surface-only', stampBasis({ headline: 'Clean, but surface-only' }, 'surface-only').headline);
  eq('stampBasis: a monitoring-backed headline is left alone',
    'Nothing broke', stampBasis({ headline: 'Nothing broke' }, 'monitoring-backed').headline);

  // ── notCheckedList ───────────────────────────────────────────────────────────
  const baseNotChecked = {
    level: 'medium', dial: DIALS.medium, focus: '',
    monitoring: { available: true, sources: [{ name: 'log' }] },
    inventory: [{ id: 'flow-1', area: 'a', exercise: 'x' }, { id: 'flow-2', area: 'b', exercise: 'y' }],
    exercisedIds: ['flow-1'], stopReason: 'ceiling', failedIterations: [],
  };
  const nc = notCheckedList(baseNotChecked);
  truthy('notCheckedList: a flow never reached is named', nc.some((s) => s.includes('b: y')));
  truthy('notCheckedList: a flow that was exercised is not listed', !nc.some((s) => s.includes('a: x')));
  truthy('notCheckedList: below ultra it discloses that findings were never re-run',
    nc.some((s) => /repro-confirmation/.test(s)));
  truthy('notCheckedList: with monitoring it does not claim blindness',
    !nc.some((s) => /internal behaviour/.test(s)));
  truthy('notCheckedList: without monitoring it says internal behaviour went unseen',
    notCheckedList({ ...baseNotChecked, monitoring: { available: false, why_absent: 'no docs' } })
      .some((s) => /internal behaviour/.test(s)));
  truthy('notCheckedList: at low it discloses that only happy paths ran',
    notCheckedList({ ...baseNotChecked, level: 'low', dial: DIALS.low })
      .some((s) => /happy paths only/.test(s)));
  truthy('notCheckedList: at ultra the repro-confirm disclaimer is gone',
    !notCheckedList({ ...baseNotChecked, dial: DIALS.ultra }).some((s) => /repro-confirmation/.test(s)));
  truthy('notCheckedList: a focus discloses everything outside it',
    notCheckedList({ ...baseNotChecked, focus: 'export' }).some((s) => /outside the requested focus/.test(s)));
  truthy('notCheckedList: an iteration whose agent died is named',
    notCheckedList({ ...baseNotChecked, failedIterations: [2] }).some((s) => /iteration 2/.test(s)));
  truthy('notCheckedList: a dry exit is named as the reason a flow went unreached',
    notCheckedList({ ...baseNotChecked, stopReason: 'dry' }).some((s) => /dry streak/.test(s)));

  // A flow the driver tried and could not complete is NOT never-reached. Reporting it that
  // way sends the reader looking for time, when the real problem is that nothing can drive
  // that interface.
  const withBlocked = notCheckedList({
    ...baseNotChecked,
    attemptedIds: ['flow-1', 'flow-2'],
    blocked: [{ id: 'flow-2', area: 'b', exercise: 'y', reason: 'no way to drive the GUI from a shell' }],
  });
  truthy('notCheckedList: an attempted-but-blocked flow is not reported as never reached',
    !withBlocked.some((s) => /b: y.*never reached/.test(s)));
  truthy('notCheckedList: it is reported as attempted, with the driver\'s reason',
    withBlocked.some((s) => /attempted but could not be exercised: no way to drive the GUI/.test(s)));
  truthy('notCheckedList: attemptedIds falls back to exercisedIds when absent',
    notCheckedList(baseNotChecked).some((s) => /b: y/.test(s)));

  // ── unreachedReason ──────────────────────────────────────────────────────────
  // The loop has four exits; naming the ceiling after an aborted run explains the gap with
  // a cause that did not happen, inside the section meant to prevent false impressions.
  truthy('unreachedReason: a dry exit says so',
    /dry streak/.test(unreachedReason('dry', DIALS.medium, 'medium')));
  truthy('unreachedReason: the ceiling names the level and the number',
    /ceiling of 4 at level=medium/.test(unreachedReason('ceiling', DIALS.medium, 'medium')));
  truthy('unreachedReason: an abort does NOT blame the ceiling',
    !/ceiling/.test(unreachedReason('abort:the documented launch command did not start the application', DIALS.medium, 'medium')));
  truthy('unreachedReason: an abort carries its own cause',
    /did not start the application/.test(unreachedReason('abort:the documented launch command did not start the application', DIALS.medium, 'medium')));
  truthy('unreachedReason: an exhausted inventory says so',
    /inventory was exhausted/.test(unreachedReason('exhausted', DIALS.medium, 'medium')));

  // ── buildDrift ───────────────────────────────────────────────────────────────
  // Each driver launches the application itself, so nothing structurally binds the
  // iterations to one build. The first live run silently exercised the installed release in
  // iterations 1-2 and a HEAD build in 3-4, and only the headline mentioned it.
  eq('buildDrift: one consistent build is not drift', null,
    buildDrift([{ iteration: 1, build_identity: 'v1.0' }, { iteration: 2, build_identity: 'v1.0' }]));
  eq('buildDrift: whitespace differences are not drift', null,
    buildDrift([{ iteration: 1, build_identity: 'v1.0' }, { iteration: 2, build_identity: ' v1.0 ' }]));
  eq('buildDrift: nothing reported is not drift', null, buildDrift([{ iteration: 1, build_identity: '' }]));
  const drifted = buildDrift([{ iteration: 1, build_identity: 'v0.6.2' }, { iteration: 3, build_identity: 'v0.6.2-4-gde49095' }]);
  truthy('buildDrift: two builds across iterations is drift', drifted && /did not all exercise the same build/.test(drifted));
  truthy('buildDrift: the drift names which iteration ran which build',
    drifted && /iteration 1 ran "v0\.6\.2"/.test(drifted) && /iteration 3 ran "v0\.6\.2-4-gde49095"/.test(drifted));
  truthy('buildDrift: the drift says the findings are not comparable',
    drifted && /not directly comparable/.test(drifted));

  // ── the document guard ───────────────────────────────────────────────────────
  // THE regression this exists for: on the first live run the synthesis agent emitted 39
  // findings and then answered the markdown field with "« see below »" — 13 bytes — so the
  // file the user opens was empty.
  const bigReport = { findings: Array.from({ length: 39 }, (_, i) => ({ title: `f${i}` })) };
  eq('isUsableMarkdown: a placeholder is rejected', false, isUsableMarkdown('« see below »', bigReport));
  eq('isUsableMarkdown: a missing document is rejected', false, isUsableMarkdown(undefined, bigReport));
  eq('isUsableMarkdown: a non-string is rejected', false, isUsableMarkdown({ md: 'x' }, bigReport));
  eq('isUsableMarkdown: a real document passes', true, isUsableMarkdown('x'.repeat(4000), bigReport));
  // The floor scales with the findings: prose that would pass for a clean run must not pass
  // for a 39-finding one.
  eq('isUsableMarkdown: the floor scales with the finding count',
    [true, false], [isUsableMarkdown('x'.repeat(500), { findings: [] }), isUsableMarkdown('x'.repeat(500), bigReport)]);
  eq('isUsableMarkdown: a short clean report is still usable', true,
    isUsableMarkdown('x'.repeat(320), { findings: [] }));

  const fb = renderFallbackMarkdown({
    verdict: 'broken', evidence_basis: 'surface-only', headline: 'it broke', stop_reason: 'ceiling',
    findings: [{
      title: 'delete does not confirm', severity: 'major', what_was_done: 'ran delete',
      expected: 'a prompt', expected_source: 'README.md', actual: 'no prompt',
      repro: 'run delete', evidence: 'log line 4', repro_confirmed: 'not-run',
    }],
    questions: [{ title: 'q1', context: 'c', why_unclear: 'w' }],
    proposals: [{ action: 'add a prompt', rationale: 'data loss' }],
    checked: ['flow-1'], not_checked: ['flow-2 — never reached'],
  }, { repoRoot: '/repo', level: 'medium', focus: '' });
  truthy('renderFallbackMarkdown: the verdict and basis survive', /broken \(surface-only\)/.test(fb));
  truthy('renderFallbackMarkdown: the finding survives with its repro and evidence',
    /delete does not confirm/.test(fb) && /run delete/.test(fb) && /log line 4/.test(fb));
  truthy('renderFallbackMarkdown: the expectation cites its source', /README\.md/.test(fb));
  truthy('renderFallbackMarkdown: questions, proposals and coverage survive',
    /q1/.test(fb) && /add a prompt/.test(fb) && /never reached/.test(fb));
  // A mechanically assembled document must say so, or it reads as the intended prose.
  truthy('renderFallbackMarkdown: it discloses that it was assembled mechanically',
    /assembled mechanically/.test(fb));
  truthy('renderFallbackMarkdown: its own output clears the usability floor',
    isUsableMarkdown(fb, { findings: [{}] }));

  // ── bad-args bailout (orchestration) ─────────────────────────────────────────
  truthy('bailout: bad args return the diagnostic error object',
    ret && typeof ret.error === 'string' && /repoRoot and referencesDir/.test(ret.error),
    `got ${JSON.stringify(ret)}`);
  eq('bailout: the error object echoes the received args type', 'string', ret && ret.got && ret.got.type);
  if (!agentCalled) ok('bailout: no agent spawned on the bad-args path');
  else bad('bailout: no agent spawned on the bad-args path');

  // ── orchestration ────────────────────────────────────────────────────────────
  // Drive the FULL recon → loop → confirm → synthesis pipeline through stubbed hooks.
  // Without this the loop never executes, so a variable dropped from its destructure would
  // throw a ReferenceError only mid-run — after the application has already been launched
  // and used against live data.
  const BATCH_IDS = /\[((?:flow|lead)-[0-9-]+)\]/g;

  const runTest = async (over, opts = {}) => {
    const labels = [];
    const prompts = [];
    const analystFor = opts.analyst || (() => ({ findings: [], questions: [], leads: [] }));
    let iteration = 0;
    const agent = async (prompt, o = {}) => {
      labels.push(o.label);
      prompts.push(prompt);
      if (o.label === 'recon') return opts.recon || healthyRecon();
      if (o.label && o.label.startsWith('driver-')) {
        iteration = Number(o.label.split('-')[1]);
        if (opts.driver) return opts.driver(iteration, prompt);
        const ids = [...prompt.matchAll(BATCH_IDS)].map((m) => m[1]);
        return {
          iteration, launched: true, teardown_ok: true,
          build_identity: opts.build ? opts.build(iteration) : 'v1.0',
          mutating_actions: [`created a record in iteration ${iteration}`],
          flows: ids.map((id) => ({ id, steps_taken: 's', observed: 'o', completed: true })),
        };
      }
      if (o.label && o.label.startsWith('analyst-')) {
        const a = analystFor(iteration);
        return a === null ? null : { iteration, ...a };
      }
      if (o.label && o.label.startsWith('confirm-')) return { reproduced: true, evidence: 'seen again' };
      if (o.label && o.label.startsWith('janitor-')) return { summary: 'stopped a stray process' };
      if (o.label === 'document') {
        return opts.document ? opts.document(prompt) : { report_markdown: '# report\n\n' + 'x'.repeat(4000) };
      }
      // The synthesis agent carries the loop's findings through into the report; the
      // document stage and its fallback are both fed from THIS, not from the analysts.
      return {
        verdict: 'rough', evidence_basis: 'monitoring-backed', headline: 'h',
        findings: /delete does not confirm/.test(prompt)
          ? [{
              title: 'delete does not confirm', severity: 'major', what_was_done: 'd',
              expected: 'e', expected_source: 'README.md', actual: 'a', repro: 'r',
              repro_confirmed: 'not-run',
            }]
          : [],
        questions: [], proposals: [], checked: [], not_checked: [],
        stop_reason: 's',
      };
    };
    const { ret: r } = await load({
      agent,
      args: { repoRoot: '/repo', referencesDir: '/s/references', scratchDir: '/tmp/sc', ...over },
      log: () => {},
      phase: () => {},
    });
    return { ret: r, labels, prompts };
  };

  const finding = () => ({
    findings: [{
      title: 'delete does not confirm', what_was_done: 'd', expected: 'e',
      expected_source: 'README.md', actual: 'a', severity: 'major', repro: 'r',
    }],
    questions: [], leads: [],
  });

  const full = await runTest({ level: 'medium' }, { analyst: finding });
  eq('orchestration: the run completes and reports', 'rough', full.ret && full.ret.report && full.ret.report.verdict);
  eq('orchestration: it does not abort', undefined, full.ret && full.ret.aborted);
  eq('orchestration: a productive run uses the whole ceiling',
    DIALS.medium.ceiling, full.labels.filter((l) => l.startsWith('driver-')).length);
  eq('orchestration: the stop reason is the ceiling', 'ceiling', full.ret && full.ret.stop_reason);
  eq('orchestration: no repro-confirm below ultra', 0, full.labels.filter((l) => l.startsWith('confirm-')).length);
  // The regression that motivates driving the loop: these reach the prompt that launches
  // the user's application and writes captured evidence.
  truthy('orchestration: the repo root reaches the driver prompt',
    full.prompts.some((p, i) => full.labels[i] === 'driver-1' && p.includes('/repo')));
  truthy('orchestration: the scratch dir reaches the driver prompt',
    full.prompts.some((p, i) => full.labels[i] === 'driver-1' && p.includes('/tmp/sc')));
  truthy('orchestration: break-it.md reaches the driver at an aggressive level',
    full.prompts.some((p, i) => full.labels[i] === 'driver-1' && p.includes('/s/references/break-it.md')));
  truthy('orchestration: the driver is told not to judge',
    full.prompts.some((p, i) => full.labels[i] === 'driver-1' && /No verdicts/i.test(p)));
  truthy('orchestration: the analyst is told the code is not a yardstick',
    full.prompts.some((p, i) => full.labels[i] === 'analyst-1' && /NOT A YARDSTICK/i.test(p)));

  const low = await runTest({ level: 'low' }, { analyst: finding });
  truthy('orchestration: at low the driver is not sent break-it.md',
    !low.prompts.some((p, i) => low.labels[i] === 'driver-1' && p.includes('break-it.md')));

  const deep = await runTest({ level: 'ultra' }, { analyst: (i) => (i === 1 ? finding() : { findings: [], questions: [], leads: [] }) });
  eq('orchestration: ultra re-runs each finding in isolation',
    1, deep.labels.filter((l) => l.startsWith('confirm-')).length);
  eq('orchestration: a reproduced finding is marked confirmed',
    'yes', deep.ret && deep.ret.raw && deep.ret.raw.findings[0].repro_confirmed);

  // Two consecutive quiet iterations end the run before the ceiling.
  const dry = await runTest({ level: 'high' });
  eq('orchestration: two dry iterations stop the run early',
    DRY_LIMIT, dry.labels.filter((l) => l.startsWith('driver-')).length);
  eq('orchestration: the early exit is reported as dry', 'dry', dry.ret && dry.ret.stop_reason);

  // A lead raised in iteration 1 must become an ASSIGNED flow in iteration 2 — that is the
  // whole difference between a loop and a for-each over a fixed plan.
  const withLead = await runTest({ level: 'medium' }, {
    analyst: (i) => (i === 1
      ? { findings: [], questions: [], leads: [{ area: 'purge', exercise: 'run purge on an empty store', why: 'log warned' }] }
      : finding()),
  });
  truthy('orchestration: an analyst lead becomes an assigned flow next iteration',
    withLead.prompts.some((p, i) => withLead.labels[i] === 'driver-2' && p.includes('run purge on an empty store')),
    'the lead never reached a driver');
  truthy('orchestration: the lead carries why it was raised',
    withLead.prompts.some((p, i) => withLead.labels[i] === 'driver-2' && p.includes('log warned')));

  // Abort gates must produce a remediation report through the real pipeline, not crash.
  const unlaunchable = await runTest({}, {
    recon: { ...healthyRecon(), launch_contract: { complete: false, missing: 'nothing documented' } },
  });
  eq('orchestration: an undocumented launch aborts with a remediation report',
    true, unlaunchable.ret && unlaunchable.ret.aborted);
  eq('orchestration: an aborted run launches nothing',
    0, unlaunchable.labels.filter((l) => l.startsWith('driver-')).length);
  truthy('orchestration: the abort still returns a report object', unlaunchable.ret && !!unlaunchable.ret.report);

  const mismatched = await runTest({ focus: 'billing' }, {
    recon: { ...healthyRecon(), focus_map: { in_scope_ids: [], unmatched_reason: 'no such area' } },
  });
  truthy('orchestration: an unmatched focus aborts before touching the application',
    mismatched.ret && mismatched.ret.aborted &&
    mismatched.labels.filter((l) => l.startsWith('driver-')).length === 0);

  // A driver that cannot launch will not launch on the next iteration either — the contract
  // is identical each time — so the run stops instead of burning the ceiling on it, and the
  // janitor runs in case a half-started process was left behind.
  const cannotLaunch = await runTest({ level: 'high' }, {
    driver: () => ({ iteration: 1, launched: false, launch_notes: 'command not found', flows: [], teardown_ok: true }),
  });
  eq('orchestration: a launch failure on the first iteration stops the run',
    1, cannotLaunch.labels.filter((l) => l.startsWith('driver-')).length);
  truthy('orchestration: the janitor runs after a failed launch',
    cannotLaunch.labels.some((l) => l.startsWith('janitor-')));
  truthy('orchestration: the launch failure is reported as the stop reason',
    cannotLaunch.ret && /abort:/.test(cannotLaunch.ret.stop_reason || ''),
    `got ${cannotLaunch.ret && cannotLaunch.ret.stop_reason}`);

  // The surface-only caveat is enforced in code, not left to the synthesis agent.
  const blind = await runTest({}, {
    recon: { ...healthyRecon(), monitoring_contract: { available: false, why_absent: 'no monitoring docs' } },
    analyst: finding,
  });
  eq('orchestration: a run without monitoring is marked surface-only',
    'surface-only', blind.ret && blind.ret.evidence_basis);
  truthy('orchestration: the surface-only caveat is forced into the headline',
    blind.ret && /surface-only/.test(blind.ret.report.headline),
    `got ${blind.ret && blind.ret.report && blind.ret.report.headline}`);

  // ── the document stage (orchestration) ───────────────────────────────────────
  truthy('orchestration: a separate agent writes the document',
    full.labels.includes('document'), `labels: ${full.labels.join(', ')}`);
  truthy('orchestration: the document is attached to the report SKILL.md saves',
    full.ret && /^# report/.test(full.ret.report.report_markdown || ''));
  truthy('orchestration: the document agent is given the mutating actions to disclose',
    full.prompts.some((p, i) => full.labels[i] === 'document' && /created a record in iteration/.test(p)));
  truthy('orchestration: the document agent is told not to re-judge the analysis',
    full.prompts.some((p, i) => full.labels[i] === 'document' && /do not re-judge/i.test(p)));

  // The regression guard end-to-end: an agent that punts must not produce an empty file.
  const punted = await runTest({ level: 'medium' }, {
    analyst: finding,
    document: () => ({ report_markdown: '« see below »' }),
  });
  truthy('orchestration: a punted document falls back to a real assembled one',
    punted.ret && (punted.ret.report.report_markdown || '').length > 300,
    `got ${(punted.ret && punted.ret.report.report_markdown || '').length} chars`);
  truthy('orchestration: the fallback still carries the findings',
    punted.ret && /delete does not confirm/.test(punted.ret.report.report_markdown || ''));
  // A dead document agent is the same failure as a punt, and must be handled the same way.
  const noDoc = await runTest({ level: 'medium' }, { analyst: finding, document: () => null });
  truthy('orchestration: a dead document agent still yields a report file',
    noDoc.ret && (noDoc.ret.report.report_markdown || '').length > 300);

  // ── build drift (orchestration) ──────────────────────────────────────────────
  const mixed = await runTest({ level: 'medium' }, {
    analyst: finding,
    build: (i) => (i <= 2 ? 'v0.6.2' : 'v0.6.2-4-gde49095'),
  });
  truthy('orchestration: iterations on different builds are reported as drift',
    mixed.ret && /did not all exercise the same build/.test(mixed.ret.build_drift || ''),
    `got ${mixed.ret && mixed.ret.build_drift}`);
  truthy('orchestration: the drift lands in not_checked',
    mixed.ret && mixed.ret.raw.not_checked.some((s) => /single consistent build/.test(s)));
  truthy('orchestration: the drift is handed to the synthesis agent',
    mixed.prompts.some((p, i) => mixed.labels[i] === 'synthesis' && /BUILD DRIFT/.test(p)));
  eq('orchestration: one consistent build reports no drift', null, full.ret && full.ret.build_drift);

  // ── the blocked-flow livelock (orchestration) ────────────────────────────────
  // THE bug this guards: keying the planner on COMPLETION means a flow the driver cannot
  // finish is the highest-priority unexercised item forever. The driver is explicitly told
  // to report that state rather than substitute another interface, so a GUI app would get
  // the same impossible batch every iteration until the ceiling, produce nothing, and have
  // it reported as "never reached".
  const blockedRun = await runTest({ level: 'medium' }, {
    analyst: finding,
    driver: (i, prompt) => ({
      iteration: i, launched: true, teardown_ok: true, build_identity: 'v1.0',
      flows: [...prompt.matchAll(BATCH_IDS)].map((m) => ({
        id: m[1], steps_taken: 's', observed: 'o',
        completed: false, blocked_reason: 'no way to drive this interface from a shell',
      })),
    }),
  });
  const firstBatch = [...blockedRun.prompts[blockedRun.labels.indexOf('driver-1')].matchAll(BATCH_IDS)].map((m) => m[1]);
  const secondBatch = [...blockedRun.prompts[blockedRun.labels.indexOf('driver-2')].matchAll(BATCH_IDS)].map((m) => m[1]);
  eq('livelock: a blocked flow is not re-assigned to the next iteration',
    [], secondBatch.filter((id) => firstBatch.includes(id)));
  truthy('livelock: the run still advances through the plan', secondBatch.length > 0);
  truthy('livelock: a blocked flow is reported as attempted, not as never reached',
    blockedRun.ret && blockedRun.ret.raw.not_checked.some((s) => /attempted but could not be exercised/.test(s)));
  eq('livelock: a blocked flow is not counted as coverage', [], blockedRun.ret.raw.exercised);
  truthy('livelock: it IS counted as attempted, so the planner moves on',
    blockedRun.ret && blockedRun.ret.raw.attempted.length === firstBatch.length * 4);

  // An id the driver invented would otherwise enter the coverage claim and quietly remove a
  // flow from not_checked that nobody ran.
  const hallucinated = await runTest({ level: 'low' }, {
    driver: (i, prompt) => ({
      iteration: i, launched: true, teardown_ok: true,
      flows: [...prompt.matchAll(BATCH_IDS)].map((m) => ({ id: m[1], steps_taken: 's', observed: 'o', completed: true }))
        .concat([{ id: 'flow-999', steps_taken: 's', observed: 'o', completed: true }]),
    }),
  });
  truthy('coverage: an id outside the assigned batch is not counted',
    hallucinated.ret && !hallucinated.ret.raw.exercised.includes('flow-999'),
    `exercised: ${hallucinated.ret && hallucinated.ret.raw.exercised}`);

  // ── the dry streak survives nothing (orchestration) ──────────────────────────
  // An iteration that produced no evidence is not evidence of quiet. Letting it sit inside
  // the streak ends the run early and reports it as "the application went quiet".
  const interrupted = await runTest({ level: 'high' }, {
    recon: healthyRecon(40),
    analyst: (i) => (i === 2 ? null : { findings: [], questions: [], leads: [] }),
  });
  eq('dry streak: a failed iteration breaks the streak instead of advancing it',
    4, interrupted.labels.filter((l) => l.startsWith('driver-')).length);
  eq('dry streak: two genuinely consecutive dry iterations still stop the run',
    'dry', interrupted.ret && interrupted.ret.stop_reason);

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
