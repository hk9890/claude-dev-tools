#!/usr/bin/env node
/**
 * test-server-lifetime.js — server-side lifetime tests for bin/server.js.
 *
 * Invoked by test-server-lifetime.sh; do NOT run directly (use that wrapper).
 *
 * The page now decides how long the server lives: it proves it is still open by
 * pinging, and the server exits once the pings stop for --grace-sec. That moves
 * a lot of behaviour into the server that no browser is needed to check, so it
 * lives here rather than in the Playwright suite — this runs in CI even where
 * Playwright is absent.
 *
 * Tests:
 *   1. Argument validation: --mode required, validated; --grace-sec positive.
 *   2. CSRF token: persisted at 0600, and reused across a restart so the token
 *      already in an open tab survives a feedback Apply round.
 *   3. GET /: injects CSRF_TOKEN, HV_GENERATION and HV_MODE, and does NOT
 *      count as liveness.
 *   4. GET /ping: token-gated, reports a generation that tracks the file mtime.
 *   5. Heartbeat: pings hold the server open past its grace; silence ends it.
 *   6. POST /bye: token-gated; closes the server, but a surviving tab's ping
 *      cancels the close.
 *   7. Exit codes: abandoning a visualize page exits 0, ask and feedback exit 2.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SERVER    = path.join(REPO_ROOT, 'plugins', 'html-visualization', 'bin', 'server.js');

let PASS = 0;
let FAIL = 0;
const failures = [];

function ok(label)   { console.log('PASS: ' + label); PASS++; }
function fail(label) { console.log('FAIL: ' + label); FAIL++; failures.push(label); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Process helpers ────────────────────────────────────────────────────────

/** Run server.js to completion; resolves { code, stdout, stderr }. */
function runToCompletion(args, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [SERVER, ...args]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, timeoutMs);
    proc.on('close', (code) => { clearTimeout(killer); resolve({ code, stdout, stderr }); });
    proc.on('error', () => { clearTimeout(killer); resolve({ code: null, stdout, stderr }); });
  });
}

/** Start server.js in the background; resolves once it prints its URL. */
function startServer(htmlFile, extraArgs, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SERVER, htmlFile, ...extraArgs], {
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const state = { proc, exitCode: undefined };

    proc.stdout.on('data', (d) => {
      stdout += d;
      const m = stdout.match(/\[html-visualization\] URL: http:\/\/[^/]+:(\d+)\//);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        state.port = parseInt(m[1], 10);
        state.stdout = () => stdout;
        state.stderr = () => stderr;
        resolve(state);
      }
    });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => { state.exitCode = code; });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill('SIGKILL'); } catch (_) {}
        reject(new Error('server did not start in 5s; stderr: ' + stderr));
      }
    }, 5000);
  });
}

function killServer(srv) {
  if (!srv || !srv.proc) return;
  try { srv.proc.kill('SIGKILL'); } catch (_) {}
}

/** Wait until the server process has exited, or `timeoutMs` elapses. */
async function waitForExit(srv, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (srv.exitCode !== undefined) return srv.exitCode;
    await sleep(100);
  }
  return undefined;
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

function request(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: reqPath, headers },
      (res) => {
        let data = '';
        res.on('data', (d) => { data += d; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

const ping   = (port, token) => request(port, 'GET', '/ping', { headers: { 'x-csrf-token': token } });
const bye    = (port, token) => request(port, 'POST', '/bye', { body: JSON.stringify({ token }) });
const getRoot = (port) => request(port, 'GET', '/');

// ── Fixture ────────────────────────────────────────────────────────────────

function makePage(name = 'page.html') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-lifetime-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, '<html><head><title>t</title></head><body>hi</body></html>', 'utf8');
  return { dir, file };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ── Test 1: argument validation ────────────────────────────────────────────
//
// --mode decides whether abandoning a page is silent or is reported back to
// Claude. Defaulting it would pick one of those silently, so the server refuses
// to start instead; these pin that it refuses for the right reasons.

async function testArgs() {
  console.log('\n--- test: argument validation ---');
  const { dir, file } = makePage();
  try {
    const noMode = await runToCompletion([file]);
    if (noMode.code === 1 && /--mode is required/.test(noMode.stderr)) {
      ok('missing --mode exits 1 and says so');
    } else {
      fail(`missing --mode: exit=${noMode.code} stderr=${JSON.stringify(noMode.stderr)}`);
    }

    const badMode = await runToCompletion([file, '--mode', 'bogus']);
    if (badMode.code === 1 && /not a mode/.test(badMode.stderr)) {
      ok('unknown --mode exits 1 and names the value');
    } else {
      fail(`unknown --mode: exit=${badMode.code} stderr=${JSON.stringify(badMode.stderr)}`);
    }

    const badGrace = await runToCompletion([file, '--mode', 'ask', '--grace-sec', '0']);
    if (badGrace.code === 1 && /--grace-sec must be positive|--grace-sec must be a positive/.test(badGrace.stderr)) {
      ok('non-positive --grace-sec exits 1');
    } else {
      fail(`bad --grace-sec: exit=${badGrace.code} stderr=${JSON.stringify(badGrace.stderr)}`);
    }

    const missingFile = await runToCompletion([path.join(dir, 'nope.html'), '--mode', 'ask']);
    if (missingFile.code === 1) ok('missing html file exits 1');
    else                        fail(`missing html file: exit=${missingFile.code}`);
  } catch (err) {
    fail('argument validation: unexpected error — ' + err.message);
  } finally {
    cleanup(dir);
  }
}

// ── Test 2: CSRF token persistence ─────────────────────────────────────────
//
// Feedback mode restarts this server on the same port for every Apply round. A
// token minted per process would go stale in the tab that is already open: its
// pings would 403, the new server would credit no liveness, and it would count
// down to exit with a live page in front of it. So the token is persisted and
// reused — and, since it is now at rest in a temp dir, it must not be readable
// by other local accounts.

async function testTokenPersistence() {
  console.log('\n--- test: CSRF token persistence ---');
  const { dir, file } = makePage();
  let srv1 = null;
  let srv2 = null;
  try {
    srv1 = await startServer(file, ['--mode', 'feedback', '--grace-sec', '60']);
    const csrfPath = path.join(dir, '.csrf');

    if (fs.existsSync(csrfPath)) ok('.csrf is written beside the served document');
    else                          fail('.csrf was not written');

    const mode = fs.statSync(csrfPath).mode & 0o777;
    if (mode === 0o600) ok('.csrf is mode 0600');
    else                fail('.csrf is mode 0' + mode.toString(8) + ', expected 0600');

    const token1 = fs.readFileSync(csrfPath, 'utf8').trim();

    // Restart, as an Apply round does.
    killServer(srv1);
    await waitForExit(srv1, 3000);
    srv1 = null;

    srv2 = await startServer(file, ['--mode', 'feedback', '--grace-sec', '60']);
    const token2 = fs.readFileSync(csrfPath, 'utf8').trim();

    if (token1 === token2) ok('the same token is reused across a restart');
    else                    fail('token changed across restart — an open tab would 403');

    // The decisive assertion: the token the FIRST server handed the tab still
    // authenticates against the SECOND.
    const res = await ping(srv2.port, token1);
    if (res.status === 200) ok('a token from before the restart still pings the new server');
    else                     fail('pre-restart token got ' + res.status + ' after restart');
  } catch (err) {
    fail('token persistence: unexpected error — ' + err.message);
  } finally {
    killServer(srv1);
    killServer(srv2);
    cleanup(dir);
  }
}

// ── Test 3: injected constants, and GET / is not a heartbeat ───────────────
//
// GET / is deliberately unauthenticated so the page is reachable. That is
// exactly why it must not count as liveness: anything that can reach the port
// could otherwise hold the server open forever by fetching the document, and
// there is no fixed timeout left to backstop that.

async function testInjectionAndRootIsNotLiveness() {
  console.log('\n--- test: injected constants; GET / is not a heartbeat ---');
  const { dir, file } = makePage();
  let srv = null;
  try {
    srv = await startServer(file, ['--mode', 'visualize', '--grace-sec', '3']);
    const res = await getRoot(srv.port);

    for (const name of ['CSRF_TOKEN', 'HV_GENERATION', 'HV_MODE']) {
      if (res.body.includes(name)) ok('GET / injects ' + name);
      else                          fail('GET / did not inject ' + name);
    }
    if (/HV_MODE\s*=\s*"visualize"/.test(res.body)) ok('HV_MODE carries the running mode');
    else                                             fail('HV_MODE did not carry the mode');

    // All three constants must sit in one <script>, because visualize mode's
    // Save strips scripts mentioning CSRF_TOKEN when it clones the DOM. Split
    // across blocks, a saved offline copy would keep the heartbeat and ping a
    // host that no longer exists.
    // Sliced with indexOf rather than matched with a tag regex: a regex that
    // tries to delimit HTML tags misses the forms a real parser accepts, and
    // the invariant here needs no parsing — everything from CSRF_TOKEN to the
    // end of its own script element must carry the other two constants.
    const from = res.body.indexOf('CSRF_TOKEN');
    const to = from === -1 ? -1 : res.body.indexOf('</script', from);
    const block = from === -1 ? '' : res.body.slice(from, to === -1 ? undefined : to);
    if (block.includes('HV_GENERATION') && block.includes('HV_MODE')) {
      ok('all three constants share one CSRF_TOKEN-bearing <script> block');
    } else {
      fail('constants are split across script blocks — a saved copy would keep pinging');
    }

    // Keep fetching the document, never ping. It must still die.
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && srv.exitCode === undefined) {
      await getRoot(srv.port).catch(() => {});
      await sleep(200);
    }
    const code = await waitForExit(srv, 6000);
    if (code !== undefined) ok('repeated GET / does not keep the server alive');
    else                     fail('server survived on GET / traffic alone — scanners could pin it open');
  } catch (err) {
    fail('injection: unexpected error — ' + err.message);
  } finally {
    killServer(srv);
    cleanup(dir);
  }
}

// ── Test 4: /ping is token-gated and tracks the file mtime ─────────────────

async function testPing() {
  console.log('\n--- test: GET /ping ---');
  const { dir, file } = makePage();
  let srv = null;
  try {
    srv = await startServer(file, ['--mode', 'feedback', '--grace-sec', '60']);
    const token = fs.readFileSync(path.join(dir, '.csrf'), 'utf8').trim();

    const noToken = await request(srv.port, 'GET', '/ping');
    if (noToken.status === 403) ok('/ping without a token is refused');
    else                         fail('/ping without a token returned ' + noToken.status);

    const wrongToken = await ping(srv.port, 'not-the-token');
    if (wrongToken.status === 403) ok('/ping with a wrong token is refused');
    else                            fail('/ping with a wrong token returned ' + wrongToken.status);

    const good = await ping(srv.port, token);
    const gen1 = good.status === 200 ? JSON.parse(good.body).generation : null;
    if (gen1) ok('/ping with the token returns a generation');
    else       fail('/ping returned ' + good.status + ' ' + good.body);

    // The generation is the document's mtime, so rewriting the file advances it.
    // This is what replaces the fb-generation value Claude used to author by
    // hand — a value it could reuse, silently leaving the tab on a stale page.
    await sleep(20);
    fs.writeFileSync(file, '<html><body>round two</body></html>', 'utf8');
    const after = await ping(srv.port, token);
    const gen2 = JSON.parse(after.body).generation;
    if (gen2 !== gen1) ok('the generation advances when the document is rewritten');
    else                fail('the generation did not change after a rewrite (stuck at ' + gen1 + ')');
  } catch (err) {
    fail('/ping: unexpected error — ' + err.message);
  } finally {
    killServer(srv);
    cleanup(dir);
  }
}

// ── Test 5: the heartbeat is what keeps the server alive ───────────────────

async function testHeartbeatHoldsAndSilenceEnds() {
  console.log('\n--- test: heartbeat holds the server open; silence ends it ---');

  // 5a — a pinging page outlives its own grace window several times over.
  {
    const { dir, file } = makePage();
    let srv = null;
    try {
      srv = await startServer(file, ['--mode', 'visualize', '--grace-sec', '2']);
      const token = fs.readFileSync(path.join(dir, '.csrf'), 'utf8').trim();
      const deadline = Date.now() + 6000; // 3x the grace
      let pings = 0;
      while (Date.now() < deadline) {
        const res = await ping(srv.port, token).catch(() => null);
        if (res && res.status === 200) pings++;
        await sleep(400);
      }
      if (srv.exitCode === undefined && pings > 10) {
        ok(`a pinging page held the server open for 3x its grace (${pings} pings)`);
      } else {
        fail(`server died while being pinged (exit=${srv.exitCode}, pings=${pings})`);
      }
    } catch (err) {
      fail('heartbeat hold: unexpected error — ' + err.message);
    } finally {
      killServer(srv);
      cleanup(dir);
    }
  }

  // 5b — a page that never pings is indistinguishable from no page at all.
  {
    const { dir, file } = makePage();
    try {
      const started = Date.now();
      const run = await runToCompletion([file, '--mode', 'visualize', '--grace-sec', '2'], 15000);
      const elapsed = Date.now() - started;
      if (run.code === 0 && elapsed < 12000) {
        ok(`an unpinged page exits on its own after the grace (${elapsed}ms)`);
      } else {
        fail(`unpinged page: exit=${run.code} after ${elapsed}ms`);
      }
      if (/no heartbeat/.test(run.stdout + run.stderr)) ok('the exit message names the missing heartbeat');
      else                                              fail('exit message did not mention the heartbeat');
    } catch (err) {
      fail('heartbeat silence: unexpected error — ' + err.message);
    } finally {
      cleanup(dir);
    }
  }
}

// ── Test 6: POST /bye, and the two-tab case ────────────────────────────────
//
// The beacon does not exit the process, it schedules a close. That is the whole
// reason closing one of two open tabs is safe: the tab still open re-arms the
// clock with its next ping, and the scheduled close is cancelled.

async function testBye() {
  console.log('\n--- test: POST /bye ---');

  // 6a — unauthenticated beacons cannot close someone else's server.
  {
    const { dir, file } = makePage();
    let srv = null;
    try {
      srv = await startServer(file, ['--mode', 'visualize', '--grace-sec', '60']);
      const res = await bye(srv.port, 'not-the-token');
      if (res.status === 403) ok('/bye with a wrong token is refused');
      else                     fail('/bye with a wrong token returned ' + res.status);

      await sleep(1500);
      if (srv.exitCode === undefined) ok('a refused /bye does not schedule a close');
      else                             fail('a refused /bye closed the server');
    } catch (err) {
      fail('/bye auth: unexpected error — ' + err.message);
    } finally {
      killServer(srv);
      cleanup(dir);
    }
  }

  // 6b and 6c both run with a grace far longer than the test, and a beacon
  // window forced short. Only the beacon can explain a fast exit, so the
  // assertions are about the beacon rather than about silence — at any grace
  // short enough to run in a suite the two expire together and prove nothing.
  const FAST_BEACON = { HV_BEACON_WINDOW_MS: '1500' };
  const LONG_GRACE  = ['--grace-sec', '60'];

  // 6b — a valid beacon closes the server long before the grace would have.
  {
    const { dir, file } = makePage();
    let srv = null;
    try {
      srv = await startServer(file, ['--mode', 'visualize', ...LONG_GRACE], FAST_BEACON);
      const token = fs.readFileSync(path.join(dir, '.csrf'), 'utf8').trim();
      const res = await bye(srv.port, token);
      if (res.status === 200) ok('/bye with the token is accepted');
      else                     fail('/bye with the token returned ' + res.status);

      const started = Date.now();
      const code = await waitForExit(srv, 10000);
      const elapsed = Date.now() - started;
      if (code === 0 && elapsed < 9000) {
        ok(`a tab-close beacon ends a visualize server in ${elapsed}ms, not at the 60s grace`);
      } else {
        fail(`after /bye the server exited ${code} in ${elapsed}ms`);
      }
      const log = srv.stdout() + srv.stderr();
      if (/the page was closed/.test(log)) ok('the exit message attributes it to the close, not a timeout');
      else                                  fail('exit message did not attribute the close: ' + JSON.stringify(log));
    } catch (err) {
      fail('/bye close: unexpected error — ' + err.message);
    } finally {
      killServer(srv);
      cleanup(dir);
    }
  }

  // 6c — the decisive multi-tab case. One tab closes; a second is still open
  // and pinging. The beacon window is 1.5s, so without cancellation the server
  // would be gone within two sweeps, taking the page away from the second tab.
  {
    const { dir, file } = makePage();
    let srv = null;
    try {
      srv = await startServer(file, ['--mode', 'visualize', ...LONG_GRACE], FAST_BEACON);
      const token = fs.readFileSync(path.join(dir, '.csrf'), 'utf8').trim();

      await bye(srv.port, token);          // "tab one is closing"
      const deadline = Date.now() + 6000;  // 4x the forced beacon window
      while (Date.now() < deadline && srv.exitCode === undefined) {
        await ping(srv.port, token).catch(() => {});  // "tab two is still here"
        await sleep(300);
      }
      if (srv.exitCode === undefined) {
        ok('a surviving tab\'s ping cancels another tab\'s close beacon');
      } else {
        fail('closing one tab killed the page in a second, still-pinging tab');
      }
    } catch (err) {
      fail('/bye two-tab: unexpected error — ' + err.message);
    } finally {
      killServer(srv);
      cleanup(dir);
    }
  }
}

// ── Test 7: per-mode exit codes on an abandoned page ───────────────────────
//
// visualize's submit was always optional, so closing the page is a normal
// ending and Claude should stay quiet. In ask and feedback the round-trip was
// the point, so an abandoned page has to be reported.

async function testAbandonExitCodes() {
  console.log('\n--- test: per-mode exit codes on abandonment ---');
  for (const [mode, expected] of [['visualize', 0], ['ask', 2], ['feedback', 2]]) {
    const { dir, file } = makePage();
    try {
      const run = await runToCompletion([file, '--mode', mode, '--grace-sec', '2'], 15000);
      if (run.code === expected) {
        ok(`abandoned ${mode} page exits ${expected}`);
      } else {
        fail(`abandoned ${mode} page exited ${run.code}, expected ${expected}`);
      }
      if (mode !== 'visualize' && !/without a submit/.test(run.stderr)) {
        fail(`abandoned ${mode} page did not report the missing submit`);
      } else if (mode !== 'visualize') {
        ok(`abandoned ${mode} page reports the missing submit`);
      }
    } catch (err) {
      fail(`abandon ${mode}: unexpected error — ` + err.message);
    } finally {
      cleanup(dir);
    }
  }
}

// ── Test 8: the visualize template's inline heartbeat matches the shared file ─
//
// A visualize page must render as a saved file:// document, so it cannot link
// /assets/ and carries its own copy of heartbeat.js — the same arrangement
// overlay.js already uses. Nothing at runtime notices when the two drift, and
// the failure is silent in the worst way: visualize pages stop pinging, every
// one of them dies at the grace window, and the mode looks like it "randomly
// stops working". Pin them byte-for-byte.

function testInlineHeartbeatInSync() {
  console.log('\n--- test: visualize template inlines heartbeat.js verbatim ---');
  const shared = path.join(REPO_ROOT, 'plugins', 'html-visualization', 'assets', 'shared', 'heartbeat.js');
  const tmpl   = path.join(REPO_ROOT, 'plugins', 'html-visualization', 'references', 'visualize-template.html');

  try {
    const sharedSrc = fs.readFileSync(shared, 'utf8');
    const tmplSrc   = fs.readFileSync(tmpl, 'utf8');

    const marker = 'Verbatim copy of assets/shared/heartbeat.js';
    if (!tmplSrc.includes(marker)) {
      fail('visualize template no longer marks its inline heartbeat copy');
      return;
    }

    const after = tmplSrc.slice(tmplSrc.indexOf(marker));
    const open  = after.indexOf('<script>');
    const close = after.indexOf('</script>', open);
    if (open === -1 || close === -1) {
      fail('could not locate the inline heartbeat <script> block');
      return;
    }

    const inline = after.slice(open + '<script>'.length, close);
    // The block is indented two spaces to sit in the document; strip that back
    // off before comparing, and ignore leading/trailing blank lines.
    const dedent = (s) => s
      .split('\n')
      .map((ln) => (ln.startsWith('  ') ? ln.slice(2) : ln))
      .join('\n')
      .trim();

    // Only the inline copy carries the extra indentation; the shared file is
    // compared as authored.
    const inlineBody = dedent(inline);
    const sharedBody = sharedSrc.trim();

    if (inlineBody.startsWith(sharedBody)) {
      ok('the template inlines heartbeat.js verbatim');
    } else {
      // Report the first divergent line so the fix is obvious.
      const a = sharedBody.split('\n');
      const b = inlineBody.split('\n');
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      fail(`inline heartbeat copy diverges from assets/shared/heartbeat.js at line ${i + 1}:\n`
           + `  shared:   ${JSON.stringify(a[i])}\n`
           + `  template: ${JSON.stringify(b[i])}`);
    }

    // It must also sit in a block the Save button strips, or a saved offline
    // copy keeps a ping loop aimed at a host that no longer exists.
    if (/CSRF_TOKEN/.test(inline)) {
      ok('the inline copy mentions CSRF_TOKEN, so Save strips it from offline copies');
    } else {
      fail('the inline heartbeat would survive Save — an offline copy would ping a dead host');
    }
  } catch (err) {
    fail('inline heartbeat sync: unexpected error — ' + err.message);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  testInlineHeartbeatInSync();
  await testArgs();
  await testTokenPersistence();
  await testInjectionAndRootIsNotLiveness();
  await testPing();
  await testHeartbeatHoldsAndSilenceEnds();
  await testBye();
  await testAbandonExitCodes();

  console.log('\nResults: ' + PASS + ' passed, ' + FAIL + ' failed');
  if (FAIL > 0) {
    console.log('Failed tests:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
