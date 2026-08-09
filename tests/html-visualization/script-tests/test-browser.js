#!/usr/bin/env node
/**
 * test-browser.js — Playwright/Chromium browser regression tests for the
 * html-visualization plugin.
 *
 * Invoked by test-browser.sh; do NOT run directly (use that wrapper).
 *
 * Resolves playwright dynamically from the npm _npx cache so no package.json
 * is needed in the repo.
 *
 * Tests:
 *   1. Visualize: page renders, always-on footer present,
 *      --hv-* CSS tokens resolve in both light and dark colour schemes.
 *   2. Visualize Send trims: a whitespace-only message writes no feedback file
 *      and reports "Closed."; a padded message arrives trimmed.
 *   3. Feedback Apply loop: after an Apply submit the open browser tab
 *      auto-reloads when a fresh fb-generation is served on the same port.
 *   4. Missing shared client: an ask page authored without the
 *      /assets/shared/submit.js tag reports it and disables Submit.
 *   5. Approaches widget in single-choice mode.
 *   6. Heartbeat: the served page issues authenticated pings, and re-checks
 *      immediately when a backgrounded tab becomes visible again.
 *   7. Disconnected banner: killing the server disables Send, explains itself,
 *      and offers the typed text back on the clipboard; reconnecting clears it.
 *   8. Tab close: pagehide beacons the server down inside its grace window.
 *   9. Saved copy: Save strips the heartbeat, so an offline file neither pings
 *      nor shows a disconnected banner.
 *  10. Apply gap: the deliberate feedback-round server gap raises no banner.
 *
 * Server-side lifetime behaviour (grace expiry, exit codes, token persistence)
 * lives in test-server-lifetime.js, which needs no browser.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const http = require('http');
const { execSync, spawn } = require('child_process');

// ── Resolve playwright from npm _npx cache ─────────────────────────────────

function findPlaywright() {
  const npxCacheDir = path.join(os.homedir(), '.npm', '_npx');
  if (!fs.existsSync(npxCacheDir)) return null;
  for (const entry of fs.readdirSync(npxCacheDir)) {
    const pkgPath = path.join(npxCacheDir, entry, 'node_modules', 'playwright', 'package.json');
    if (fs.existsSync(pkgPath)) {
      return path.join(npxCacheDir, entry, 'node_modules', 'playwright');
    }
  }
  return null;
}

const playwrightDir = findPlaywright();
if (!playwrightDir) {
  const hint = 'playwright not found in npm _npx cache. '
             + 'To enable the browser suite, run: npx playwright --version && npx playwright install chromium';
  if (process.env.REQUIRE_BROWSER) {
    // CI can opt into hard browser coverage: with REQUIRE_BROWSER set, an
    // absent prerequisite is a failure, not a silent skip.
    console.error('FAIL: ' + hint + ' (REQUIRE_BROWSER is set)');
    process.exit(1);
  }
  // Playwright is an optional prerequisite (see docs/TESTING.md). Exit 77 — the
  // skip convention tests/run-all.sh recognises — so this suite is reported
  // as skipped, not folded into a green pass that ran no assertions.
  console.log('SKIP: ' + hint);
  process.exit(77);
}

process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), '.cache', 'ms-playwright');

const { chromium } = require(playwrightDir);

// ── Paths ──────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SERVER    = path.join(REPO_ROOT, 'plugins', 'html-visualization', 'bin', 'server.js');
const REF_DIR   = path.join(REPO_ROOT, 'plugins', 'html-visualization', 'references');
const VIS_TMPL  = path.join(REF_DIR, 'visualize-template.html');
const FB_TMPL   = path.join(REF_DIR, 'feedback-template.html');
const ASK_TMPL  = path.join(REF_DIR, 'ask-template.html');

// ── Counters ───────────────────────────────────────────────────────────────

let PASS = 0;
let FAIL = 0;
const failures = [];

function ok(label)   { console.log('PASS: ' + label); PASS++; }
function fail(label) { console.log('FAIL: ' + label); FAIL++; failures.push(label); }

// ── Server helpers ─────────────────────────────────────────────────────────

/**
 * Start server.js in background.
 * Returns Promise<{ pid, proc, baseUrl, feedbackFile, logFile, port }>.
 * Waits up to 5s for the URL line.
 */
function startServer(htmlFile, extraArgs = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const logFile = path.join(os.tmpdir(), `hv-test-browser-${process.pid}-${Date.now()}.log`);
    const logFd   = fs.openSync(logFile, 'w');

    const proc = spawn(process.execPath, [SERVER, htmlFile, ...extraArgs], {
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, ...extraEnv },
    });

    let resolved = false;
    const interval = setInterval(() => {
      let log = '';
      try { log = fs.readFileSync(logFile, 'utf8'); } catch (_) {}
      // The server binds all interfaces and prints its URL under the machine's
      // own hostname; take the port from that line and drive the browser over
      // loopback, so the suite does not depend on that name resolving here.
      const urlMatch = log.match(/\[html-visualization\] URL: http:\/\/[^/]+:(\d+)\//);
      if (urlMatch) {
        clearInterval(interval);
        clearTimeout(timeout);
        fs.closeSync(logFd);
        if (!resolved) {
          resolved = true;
          const port        = parseInt(urlMatch[1], 10);
          const baseUrl     = `http://127.0.0.1:${port}`;
          const fbMatch     = log.match(/\[html-visualization\] Feedback file: (.+)/);
          const feedbackFile = fbMatch ? fbMatch[1].trim() : null;
          resolve({ pid: proc.pid, proc, baseUrl, feedbackFile, logFile, port });
        }
      }
    }, 50);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      try { fs.closeSync(logFd); } catch (_) {}
      let log = '';
      try { log = fs.readFileSync(logFile, 'utf8'); } catch (_) {}
      reject(new Error('Server did not start within 5s.\nLog:\n' + log));
    }, 5000);

    proc.on('error', (err) => {
      clearInterval(interval);
      clearTimeout(timeout);
      if (!resolved) { resolved = true; reject(err); }
    });
  });
}

function killServer(srv) {
  if (!srv) return;
  try { process.kill(srv.pid, 'SIGKILL'); } catch (_) {}
  // Drain the proc's events so Node doesn't warn
  if (srv.proc) { srv.proc.on('error', () => {}); }
  try { if (srv.logFile) fs.unlinkSync(srv.logFile); } catch (_) {}
}

/**
 * Wait until a TCP port accepts connections (up to 3s).
 */
function waitForPort(port, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function tryConnect() {
      const socket = new (require('net').Socket)();
      socket.setTimeout(200);
      socket.connect(port, '127.0.0.1', () => { socket.destroy(); resolve(); });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() < deadline) setTimeout(tryConnect, 100);
        else reject(new Error('Port ' + port + ' not open after ' + timeoutMs + 'ms'));
      });
      socket.on('timeout', () => {
        socket.destroy();
        if (Date.now() < deadline) setTimeout(tryConnect, 100);
        else reject(new Error('Port ' + port + ' timed out'));
      });
    }
    tryConnect();
  });
}

// ── Test 1: visualize page ─────────────────────────────────────────────────
//
// Serves the real visualize-template.html in visualize mode.
// Asserts:
//   a) The page renders (has a <body> with content)
//   b) The always-on footer is present (#vis-message textarea, #vis-send, #vis-save)
//   c) --hv-bg CSS token resolves to a non-empty colour in light scheme
//   d) --hv-bg resolves to a DIFFERENT value in dark scheme

async function testVisualize() {
  console.log('\n--- test: visualize page ---');
  let srv = null;
  let browser = null;

  try {
    // Create a concrete HTML file from the template (template has placeholders
    // but they are valid HTML and renderable as-is)
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-vis-'));
    const htmlFile = path.join(tmpDir, 'test-vis.html');
    fs.copyFileSync(VIS_TMPL, htmlFile);

    srv = await startServer(htmlFile, ['--mode', 'visualize', '--grace-sec', '30']);

    // 1a: Launch in light mode
    browser = await chromium.launch({ headless: true });
    const lightCtx = await browser.newContext({ colorScheme: 'light' });
    const lightPage = await lightCtx.newPage();
    await lightPage.goto(srv.baseUrl + '/');
    await lightPage.waitForLoadState('domcontentloaded');

    // Assert page has a body
    const bodyExists = await lightPage.evaluate(() => !!document.body);
    if (bodyExists) ok('visualize: page renders (body exists)');
    else             fail('visualize: page body missing');

    // 1b: Footer elements present
    const textareaVisible = await lightPage.locator('#vis-message').isVisible();
    const sendVisible     = await lightPage.locator('#vis-send').isVisible();
    const saveVisible     = await lightPage.locator('#vis-save').isVisible();

    if (textareaVisible) ok('visualize: footer textarea (#vis-message) present');
    else                  fail('visualize: footer textarea (#vis-message) not visible');

    if (sendVisible) ok('visualize: Send button (#vis-send) present');
    else              fail('visualize: Send button (#vis-send) not visible');

    if (saveVisible) ok('visualize: Save button (#vis-save) present');
    else              fail('visualize: Save button (#vis-save) not visible');

    // 1c: --hv-bg resolves in light mode (non-empty, looks like a colour)
    const hvBgLight = await lightPage.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--hv-bg').trim()
    );
    if (hvBgLight) ok('visualize: --hv-bg resolves in light mode (' + hvBgLight + ')');
    else            fail('visualize: --hv-bg did not resolve in light mode');

    // 1d: --hv-bg is different in dark mode
    const darkCtx  = await browser.newContext({ colorScheme: 'dark' });
    const darkPage = await darkCtx.newPage();
    await darkPage.goto(srv.baseUrl + '/');
    await darkPage.waitForLoadState('domcontentloaded');

    const hvBgDark = await darkPage.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--hv-bg').trim()
    );
    if (hvBgDark) ok('visualize: --hv-bg resolves in dark mode (' + hvBgDark + ')');
    else           fail('visualize: --hv-bg did not resolve in dark mode');

    if (hvBgLight !== hvBgDark) {
      ok('visualize: --hv-bg differs between light (' + hvBgLight + ') and dark (' + hvBgDark + ')');
    } else {
      fail('visualize: --hv-bg same in light and dark (' + hvBgLight + ') — tokens not switching');
    }

    await browser.close();
    browser = null;
    killServer(srv);
    srv = null;
    fs.rmSync(tmpDir, { recursive: true, force: true });

  } catch (err) {
    fail('visualize: unexpected error — ' + err.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
    killServer(srv);
  }
}

// ── Test 2: visualize Send trims before submitting ─────────────────────────
//
// The server's "non-empty freeform" check tests the RAW value and leaves
// trimming to the UI, so an untrimmed blank would write a feedback file and
// re-invoke Claude with an empty message instead of closing silently. These
// two cases pin that contract from the browser side; submit is one-shot, so
// each needs its own server.

async function testVisualizeSubmitTrims() {
  console.log('\n--- test: visualize Send trims ---');
  let browser = null;

  // Returns { wrote, freeform, status } after clicking Send with `typed`.
  async function submit(typed) {
    const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-trim-'));
    const htmlFile = path.join(tmpDir, 'test-vis.html');
    fs.copyFileSync(VIS_TMPL, htmlFile);
    // --mode visualize, because the silent-close branch is visualize-only: in
    // ask and feedback every submit writes a file by design.
    const srv = await startServer(htmlFile, ['--mode', 'visualize', '--grace-sec', '30']);
    try {
      const ctx  = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(srv.baseUrl + '/');
      await page.waitForLoadState('domcontentloaded');
      await page.locator('#vis-message').fill(typed);
      await page.locator('#vis-send').click();
      await page.waitForFunction(
        () => /Sent|Closed|Error|Network/.test(document.getElementById('vis-status').textContent),
        null, { timeout: 10000 }
      );
      const status = (await page.locator('#vis-status').textContent()).trim();
      await ctx.close();
      // Give the server its moment to write and exit before we look.
      await new Promise(r => setTimeout(r, 400));
      // visualize suppresses the "Feedback file:" startup line, so derive the path
      // from the documented convention: <html-dir>/<basename-without-ext>.feedback.json
      const fbFile = path.join(tmpDir, 'test-vis.feedback.json');
      const wrote = fs.existsSync(fbFile);
      const freeform = wrote ? JSON.parse(fs.readFileSync(fbFile, 'utf8')).freeform : null;
      return { wrote, freeform, status };
    } finally {
      // killServer, not a bare kill: it also unlinks the log file startServer opened.
      try { killServer(srv); } catch (_) {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  try {
    browser = await chromium.launch({ headless: true });

    const blank = await submit('   \n  ');
    if (!blank.wrote) ok('visualize Send: whitespace-only writes no feedback file');
    else              fail(`visualize Send: whitespace-only wrote a feedback file (freeform=${JSON.stringify(blank.freeform)})`);
    if (/Closed/.test(blank.status)) ok('visualize Send: whitespace-only reports "Closed."');
    else                              fail(`visualize Send: whitespace-only status was "${blank.status}", expected "Closed."`);

    const padded = await submit('   hello there   ');
    if (padded.wrote) ok('visualize Send: padded message writes a feedback file');
    else              fail('visualize Send: padded message wrote no feedback file');
    if (padded.freeform === 'hello there') ok('visualize Send: submitted freeform is trimmed');
    else                                    fail(`visualize Send: freeform was ${JSON.stringify(padded.freeform)}, expected "hello there"`);
  } catch (e) {
    fail('visualize Send trims: ' + e.message);
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
  }
}

// ── Test 3: feedback Apply-loop auto-reload ────────────────────────────────
//
// Serves feedback-template.html (with a concrete fb-generation value).
// Loads it in Chromium. Submits an Apply action via the server's /submit
// endpoint. Then re-serves on the same port with a CHANGED fb-generation.
// Asserts that the open tab auto-reloads (sentinel pattern).

async function testFeedbackApplyLoop() {
  console.log('\n--- test: feedback Apply-loop auto-reload ---');
  let srv1 = null;
  let srv2 = null;
  let browser = null;

  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-fb-'));
    const htmlFile = path.join(tmpDir, 'review.html');

    // ── Round 1 ───────────────────────────────────────────────────────────
    // The generation is the file's mtime now, injected by the server, so the
    // document needs nothing written into it — which is the point: Claude can
    // no longer forget to change a value, or reuse one, and leave the tab
    // sitting on a stale page.
    const fbTmplHtml = fs.readFileSync(FB_TMPL, 'utf8');
    fs.writeFileSync(htmlFile, fbTmplHtml, 'utf8');

    srv1 = await startServer(htmlFile, ['--mode', 'feedback']);
    const port = srv1.port;

    // Write the .port file (mirrors the Cycle C contract)
    fs.writeFileSync(path.join(tmpDir, '.port'), String(port), 'utf8');

    // ── Load the page in Chromium ──────────────────────────────────────────
    browser = await chromium.launch({ headless: true });
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(srv1.baseUrl + '/');
    await page.waitForLoadState('domcontentloaded');

    // The server injects the generation as a page constant.
    const gen1InPage = await page.evaluate(
      () => (typeof HV_GENERATION !== 'undefined' ? HV_GENERATION : null)
    );
    if (gen1InPage) {
      ok('feedback Apply-loop: round-1 page carries an injected HV_GENERATION');
    } else {
      fail('feedback Apply-loop: HV_GENERATION was not injected');
    }

    // ── Submit an Apply action to the first server ─────────────────────────
    // Fetch the CSRF token from the rendered page
    const token = await page.evaluate(() => {
      return (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : null;
    });
    if (!token) {
      fail('feedback Apply-loop: CSRF_TOKEN not injected into page');
      throw new Error('Cannot proceed without CSRF token');
    }
    ok('feedback Apply-loop: CSRF_TOKEN injected into page');

    // Plant a sentinel before triggering the reload
    await page.evaluate(() => { window.__reloadSentinel = true; });

    // The Apply button is disabled when freeform is empty and there are no
    // comments (hasContent() = false). Type something to enable it, then click.
    await page.locator('#freeform-input').fill('Apply round 1 feedback');
    // Wait for the button to become enabled (input event fires updateActionButtons)
    await page.locator('#apply-btn:not([disabled])').waitFor({ timeout: 3000 });
    await page.locator('#apply-btn').click();

    // Wait for the apply response to come back (page hides feedback-doc and
    // shows state-applying on success)
    const applySucceeded = await page.locator('#state-applying').waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (applySucceeded) {
      ok('feedback Apply-loop: Apply submit returned 200 and state-applying shown');
    } else {
      fail('feedback Apply-loop: state-applying not shown after Apply click');
      throw new Error('Apply submit failed, cannot test reload');
    }

    // Wait for server 1 to exit after the apply submit
    await new Promise((resolve) => {
      srv1.proc.on('exit', resolve);
      // Give it up to 3s
      setTimeout(resolve, 3000);
    });
    srv1 = null; // mark as stopped

    // ── Round 2: regenerate the document and re-serve on the same port ────
    // Rewriting the file is the entire regeneration protocol now — the mtime it
    // advances is the generation. Sleep first so the new mtime is distinguishable
    // on filesystems with coarse timestamps.
    await new Promise((r) => setTimeout(r, 50));
    fs.writeFileSync(htmlFile, fbTmplHtml.replace('</body>', '<!-- round two --></body>'), 'utf8');

    // Wait briefly for the port to be freed, then start the second server
    // on the same port (up to 2 retries as per serve.md contract)
    let srv2Started = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        srv2 = await startServer(htmlFile, ['--mode', 'feedback', '--port', String(port)]);
        srv2Started = true;
        break;
      } catch (err) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    if (!srv2Started) {
      fail('feedback Apply-loop: could not re-serve on same port ' + port);
      throw new Error('Re-serve failed');
    }
    ok('feedback Apply-loop: re-served on same port ' + port);

    // ── Wait for the open tab to auto-reload ──────────────────────────────
    // The heartbeat is in its fast (1s) rate because the page knows it asked
    // for a regeneration; the first ping to reach the new server reports a
    // different generation and the page reloads. The sentinel is cleared by
    // that reload. Wait up to 10s for it to disappear.
    let reloaded = false;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
      const sentinelGone = await page.evaluate(() => {
        return typeof window.__reloadSentinel === 'undefined';
      }).catch(() => true); // page navigating — treat as reloaded
      if (sentinelGone) { reloaded = true; break; }
    }

    if (reloaded) {
      ok('feedback Apply-loop: open tab auto-reloaded once the regenerated document was served');
    } else {
      fail('feedback Apply-loop: open tab did NOT auto-reload within 10s');
    }

    // Verify the reloaded page carries the advanced generation
    await page.waitForLoadState('domcontentloaded');
    const gen2InPage = await page.evaluate(
      () => (typeof HV_GENERATION !== 'undefined' ? HV_GENERATION : null)
    ).catch(() => null);

    if (gen2InPage && gen2InPage !== gen1InPage) {
      ok('feedback Apply-loop: reloaded page carries the advanced generation');
    } else {
      fail('feedback Apply-loop: generation did not advance across the reload '
           + '(round 1 = ' + gen1InPage + ', round 2 = ' + gen2InPage + ')');
    }

    await browser.close();
    browser = null;
    killServer(srv2);
    srv2 = null;
    fs.rmSync(tmpDir, { recursive: true, force: true });

  } catch (err) {
    fail('feedback Apply-loop: unexpected error — ' + err.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
    killServer(srv1);
    killServer(srv2);
  }
}

// ── Test 4: a page missing the shared submit client says so ────────────────
//
// The two required <script> tags are enforced only by the template and a
// markup checklist. A page authored with just the mode app.js renders and
// accepts every answer normally, so the omission is invisible until Submit
// throws — no POST, no error panel, and a blocking server waiting out its
// timeout. app.js checks for the client at load instead; this pins that, and
// the intact template pins that the check does not misfire.

async function testMissingSharedClient() {
  console.log('\n--- test: ask page missing /assets/shared/submit.js ---');
  let browser = null;
  let tmpDir = null;

  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-noclient-'));
    const askHtml = fs.readFileSync(ASK_TMPL, 'utf8');
    const stripped = askHtml.replace(
      /[ \t]*<script src="\/assets\/shared\/submit\.js"><\/script>\r?\n/,
      ''
    );
    if (stripped === askHtml) {
      fail('missing shared client: could not strip the submit.js tag from ask-template.html');
      return;
    }

    browser = await chromium.launch({ headless: true });

    // Serve `html` and read back the state of the submit row.
    async function probe(html, name) {
      const htmlFile = path.join(tmpDir, name);
      fs.writeFileSync(htmlFile, html, 'utf8');
      const srv = await startServer(htmlFile, ['--mode', 'visualize', '--grace-sec', '30']);
      try {
        const ctx  = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(srv.baseUrl + '/');
        await page.waitForLoadState('domcontentloaded');
        const state = await page.evaluate(() => {
          const err = document.getElementById('submit-error');
          const btn = document.getElementById('submit-btn');
          return {
            errorShown: !!err && getComputedStyle(err).display !== 'none',
            errorText: err ? err.textContent : '',
            submitDisabled: !!btn && btn.disabled,
            submitTitle: btn ? (btn.title || '') : '',
          };
        });
        await ctx.close();
        return state;
      } finally {
        killServer(srv);
      }
    }

    const broken = await probe(stripped, 'ask-no-client.html');

    if (broken.errorShown && /submit\.js/.test(broken.errorText)) {
      ok('missing shared client: #submit-error names the missing script at load');
    } else {
      fail('missing shared client: #submit-error not shown with the script name '
           + '(shown=' + broken.errorShown + ', text=' + JSON.stringify(broken.errorText) + ')');
    }

    if (broken.submitDisabled) ok('missing shared client: Submit is disabled');
    else                        fail('missing shared client: Submit still enabled');

    if (/submit\.js/.test(broken.submitTitle)) {
      ok('missing shared client: Submit carries an explanatory title');
    } else {
      fail('missing shared client: Submit title does not explain why '
           + '(title=' + JSON.stringify(broken.submitTitle) + ')');
    }

    const intact = await probe(askHtml, 'ask-intact.html');

    if (!intact.errorShown) ok('intact ask page: no error panel at load');
    else                     fail('intact ask page: error panel shown at load — the check misfires');

    if (!intact.submitDisabled) ok('intact ask page: Submit stays enabled');
    else                         fail('intact ask page: Submit disabled — the check misfires');

    await browser.close();
    browser = null;

  } catch (err) {
    fail('missing shared client: unexpected error — ' + err.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
  } finally {
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }
}

// ── Test 5: approaches widget, single-choice mode ──────────────────────────
// The default (independent) mode gives each column its own approve/reject, so two
// mutually exclusive options can both be approved and both be rejected — answers
// that decide nothing. data-choice="single" puts the columns in one radio group.
// The payload shape differs between the modes, so this pins both the exclusivity
// and the key it lands under.

async function testApproachesSingleChoice() {
  console.log('\n--- test: approaches widget in single-choice mode ---');
  let browser = null, srv = null, tmpDir = null;

  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-approaches-'));
    const htmlFile = path.join(tmpDir, 'feedback.html');
    fs.writeFileSync(htmlFile, fs.readFileSync(ASK_TMPL, 'utf8'));

    srv = await startServer(htmlFile, ['--mode', 'ask']);
    await waitForPort(srv.port);

    browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    await page.goto(srv.baseUrl + '/', { waitUntil: 'networkidle' });

    const group = 'input[name="q-approach"]';
    const count = await page.locator(group).count();
    if (count >= 3) ok(`single choice: template offers ${count} options in one group`);
    else            fail(`single choice: expected the two columns plus a neither option, saw ${count}`);

    // Exclusivity: each pick must clear the previous one.
    await page.check(`${group}[value="a"]`);
    await page.check(`${group}[value="b"]`);
    const checked = await page.evaluate(() => {
      const on = document.querySelectorAll('input[name="q-approach"]:checked');
      return { n: on.length, value: on.length ? on[0].value : null };
    });
    if (checked.n === 1 && checked.value === 'b') {
      ok('single choice: picking a second approach clears the first');
    } else {
      fail(`single choice: ${checked.n} option(s) checked after two picks (value=${checked.value})`);
    }

    // The payload must carry ONE key for the widget, not one per column.
    await page.click('#submit-btn');
    await page.waitForTimeout(600);

    let payload = null;
    try { payload = JSON.parse(fs.readFileSync(srv.feedbackFile, 'utf8')); } catch (_) {}

    if (!payload) {
      fail('single choice: no feedback file written on submit');
    } else if (payload.answers['q-approach'] === 'b') {
      ok('single choice: answers["q-approach"] carries the winning approach id');
    } else {
      fail('single choice: expected answers["q-approach"]="b", got '
           + JSON.stringify(payload.answers['q-approach']));
    }

    if (payload && !('q-approach-a' in payload.answers)) {
      ok('single choice: no per-column keys leak into the payload');
    } else if (payload) {
      fail('single choice: per-column key q-approach-a present in single mode');
    }

    await browser.close(); browser = null;

  } catch (err) {
    fail('single choice: unexpected error — ' + err.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
  } finally {
    killServer(srv);
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }
}

// ── Test 6: the page really sends the heartbeat ────────────────────────────
//
// The server suite proves that pings hold a server open. What only a browser
// can prove is that a real page issues them at all, with the token attached —
// an unauthenticated ping is not credited, so a page that pinged without the
// header would look alive here and still die at the grace window.

async function testHeartbeatIsSent() {
  console.log('\n--- test: the served page sends authenticated pings ---');
  let srv = null, browser = null, tmpDir = null;

  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-ping-'));
    const htmlFile = path.join(tmpDir, 'visualization.html');
    fs.copyFileSync(VIS_TMPL, htmlFile);
    srv = await startServer(htmlFile, ['--mode', 'visualize', '--grace-sec', '60']);

    browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext()).newPage();

    const pings = [];
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (u.pathname === '/ping') pings.push(req.headers()['x-csrf-token'] || '');
    });

    await page.goto(srv.baseUrl + '/');
    await page.waitForLoadState('domcontentloaded');
    // The loop fires one immediately at start rather than waiting out the first
    // interval, so the server learns the page exists straight away.
    await page.waitForTimeout(1500);

    if (pings.length > 0) ok('visualize page pings /ping on load');
    else                   fail('visualize page never pinged');

    if (pings.length && pings[0] && pings[0].length > 20) {
      ok('the ping carries the CSRF token header');
    } else {
      fail('the ping carried no usable x-csrf-token (' + JSON.stringify(pings[0]) + ')');
    }

    // Returning to a backgrounded tab must re-check immediately: the browser
    // throttles timers in hidden tabs, so the interval alone can leave a user
    // staring at a page whose server died while they were away.
    const before = pings.length;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(800);
    if (pings.length > before) ok('becoming visible again triggers an immediate ping');
    else                        fail('visibilitychange did not force a ping');

    await browser.close(); browser = null;
  } catch (err) {
    fail('heartbeat sent: unexpected error — ' + err.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
  } finally {
    killServer(srv);
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }
}

// ── Test 7: the page tells the user when the server has died ───────────────
//
// This is the failure the whole change exists to fix. Before it, a page whose
// server was gone looked completely normal: you typed a message, pressed Send,
// and only then found out. Now a failed ping disables the controls, says so,
// and offers the typed text back rather than stranding it.

async function testDisconnectedBanner() {
  console.log('\n--- test: disconnected banner when the server dies ---');
  let srv = null, browser = null, tmpDir = null;

  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-dead-'));
    const htmlFile = path.join(tmpDir, 'visualization.html');
    fs.copyFileSync(VIS_TMPL, htmlFile);
    srv = await startServer(htmlFile, ['--mode', 'visualize', '--grace-sec', '60']);
    const port = srv.port;

    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    await page.goto(srv.baseUrl + '/');
    await page.waitForLoadState('domcontentloaded');

    // Type something, so there is work to strand.
    await page.locator('#vis-message').fill('half-written thought');

    const bannerBefore = await page.locator('#hv-disconnected').count();
    if (bannerBefore === 0) ok('no banner while the server is up');
    else                     fail('banner shown against a live server');

    // Kill the server out from under the page, the way a timeout or a crash
    // would. Then force the check rather than waiting out the idle interval.
    killServer(srv); srv = null;
    await page.waitForTimeout(300);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    await page.locator('#hv-disconnected').waitFor({ state: 'visible', timeout: 8000 });
    ok('a dead server raises the disconnected banner');

    const sendDisabled = await page.locator('#vis-send').isDisabled();
    if (sendDisabled) ok('Send is disabled while disconnected');
    else               fail('Send still enabled after the server died');

    const bannerText = await page.locator('#hv-disconnected').textContent();
    if (/no longer reach/i.test(bannerText)) ok('the banner explains the page cannot reach Claude');
    else                                      fail('banner text unclear: ' + JSON.stringify(bannerText));

    // The copy button is the whole point: the typed text must survive.
    const copyBtn = page.locator('#hv-disconnected button');
    if (await copyBtn.count()) {
      ok('the banner offers a copy button for the stranded text');
      await copyBtn.click();
      await page.waitForTimeout(300);
      const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
      if (clip.indexOf('half-written thought') !== -1) {
        ok('the copy button puts the typed text on the clipboard');
      } else {
        fail('clipboard did not receive the typed text (got ' + JSON.stringify(clip) + ')');
      }
    } else {
      fail('no copy button in the disconnected banner');
    }

    // ── Recovery: the same port comes back, as a feedback Apply round does ──
    srv = await startServer(htmlFile, ['--mode', 'visualize', '--grace-sec', '60', '--port', String(port)]);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('#hv-disconnected').waitFor({ state: 'detached', timeout: 8000 });
    ok('the banner clears when the server comes back');

    const sendReEnabled = await page.locator('#vis-send').isEnabled();
    if (sendReEnabled) ok('Send is re-enabled on reconnect');
    else                fail('Send stayed disabled after reconnect');

    await browser.close(); browser = null;
  } catch (err) {
    fail('disconnected banner: unexpected error — ' + err.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
  } finally {
    killServer(srv);
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }
}

// ── Test 8: closing the tab shuts the server down ──────────────────────────
//
// The beacon is what makes a closed page give its port back promptly instead of
// idling out the grace window. Only a real browser fires pagehide.

async function testTabCloseEndsServer() {
  console.log('\n--- test: closing the tab ends the server ---');
  let srv = null, browser = null, tmpDir = null;

  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-close-'));
    const htmlFile = path.join(tmpDir, 'visualization.html');
    fs.copyFileSync(VIS_TMPL, htmlFile);

    // A grace far longer than the test, and a beacon window forced short: only
    // the beacon can explain a fast exit.
    srv = await startServer(htmlFile, ['--mode', 'visualize', '--grace-sec', '120'],
                            { HV_BEACON_WINDOW_MS: '1500' });

    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(srv.baseUrl + '/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    let exited = false;
    srv.proc.on('exit', () => { exited = true; });

    // Close the page, not the context: tearing the whole context down can take
    // the network stack with it before a queued beacon is flushed, which would
    // make this fail for a reason that has nothing to do with the page.
    await page.close(); // pagehide -> sendBeacon('/bye')

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline && !exited) await new Promise((r) => setTimeout(r, 200));

    if (exited) ok('closing the tab ended the server well inside its 120s grace');
    else         fail('server outlived the closed tab — the beacon did not arrive');

    await browser.close(); browser = null;
  } catch (err) {
    fail('tab close: unexpected error — ' + err.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
  } finally {
    killServer(srv);
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }
}

// ── Test 9: a saved offline copy neither pings nor cries disconnected ──────
//
// Save clones the DOM and drops every script mentioning CSRF_TOKEN, which is
// how the heartbeat is kept out of the saved file. If that ever stopped
// working, an offline copy would loop forever against a host that is gone and
// paint a "disconnected" banner over a page that is behaving exactly as
// intended — so check the saved artefact itself, not just the live page.

async function testSavedCopyIsInert() {
  console.log('\n--- test: a saved copy does not ping ---');
  let srv = null, browser = null, tmpDir = null;

  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-saved-'));
    const htmlFile = path.join(tmpDir, 'visualization.html');
    fs.copyFileSync(VIS_TMPL, htmlFile);
    srv = await startServer(htmlFile, ['--mode', 'visualize', '--grace-sec', '60']);

    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    await page.goto(srv.baseUrl + '/');
    await page.waitForLoadState('domcontentloaded');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.locator('#vis-save').click(),
    ]);
    const savedPath = path.join(tmpDir, 'saved.html');
    await download.saveAs(savedPath);
    // Open the saved file with no server behind it, and assert against the
    // parsed DOM rather than against the file as text. Matching tags with a
    // regex misses the cases a real parser handles (`</script >`, among others),
    // and there is no reason to reach for one here: a browser is already open,
    // and the Save button's own strip runs against the DOM too — so this checks
    // the same surface Save operated on.
    const offline = await ctx.newPage();
    const offlineRequests = [];
    offline.on('request', (req) => { offlineRequests.push(req.url()); });
    await offline.goto('file://' + savedPath);
    await offline.waitForTimeout(1500);

    const scriptBodies = await offline.evaluate(() =>
      Array.from(document.querySelectorAll('script'))
        .map((s) => s.textContent || '')
        .join('\n')
    );

    if (scriptBodies.indexOf('CSRF_TOKEN') === -1) ok('no surviving script carries the CSRF token');
    else                                            fail('a script in the saved copy still references CSRF_TOKEN');

    if (scriptBodies.indexOf('hvHeartbeat') === -1) ok('no surviving script carries the heartbeat');
    else                                             fail('the saved copy still runs the heartbeat — it would ping a dead host');

    if (!offlineRequests.some((u) => u.indexOf('/ping') !== -1)) {
      ok('the saved copy opened offline issues no ping');
    } else {
      fail('the saved copy pinged from file://');
    }
    if (await offline.locator('#hv-disconnected').count() === 0) {
      ok('the saved copy shows no disconnected banner');
    } else {
      fail('the saved copy shows a disconnected banner — it is offline by design');
    }

    await browser.close(); browser = null;
  } catch (err) {
    fail('saved copy: unexpected error — ' + err.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
  } finally {
    killServer(srv);
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }
}

// ── Test 10: the Apply gap does not raise a false alarm ────────────────────
//
// Feedback mode takes its own server away on every Apply round. Reporting that
// as "disconnected" would cry wolf on the one gap the page caused deliberately,
// so the applying state has to win over the banner.

async function testApplyGapShowsNoBanner() {
  console.log('\n--- test: the Apply gap shows no disconnected banner ---');
  let srv = null, browser = null, tmpDir = null;

  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-applygap-'));
    const htmlFile = path.join(tmpDir, 'review.html');
    fs.copyFileSync(FB_TMPL, htmlFile);
    srv = await startServer(htmlFile, ['--mode', 'feedback']);

    browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext()).newPage();
    await page.goto(srv.baseUrl + '/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('#freeform-input').fill('please apply this');
    await page.locator('#apply-btn:not([disabled])').waitFor({ timeout: 3000 });
    await page.locator('#apply-btn').click();
    await page.locator('#state-applying').waitFor({ state: 'visible', timeout: 5000 });

    // The server exits on the apply submit; Claude would now be regenerating.
    // Hold that gap open far longer than a ping interval and force checks.
    await new Promise((resolve) => { srv.proc.on('exit', resolve); setTimeout(resolve, 3000); });
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForTimeout(400);
    }

    const banner = await page.locator('#hv-disconnected').count();
    if (banner === 0) ok('no disconnected banner during the Apply gap');
    else               fail('the Apply gap raised a false disconnected banner');

    const applyingVisible = await page.locator('#state-applying').isVisible();
    if (applyingVisible) ok('the applying state stays on screen through the gap');
    else                  fail('the applying state disappeared during the gap');

    await browser.close(); browser = null;
  } catch (err) {
    fail('apply gap: unexpected error — ' + err.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
  } finally {
    killServer(srv);
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  await testVisualize();
  await testVisualizeSubmitTrims();
  await testFeedbackApplyLoop();
  await testMissingSharedClient();
  await testApproachesSingleChoice();
  await testHeartbeatIsSent();
  await testDisconnectedBanner();
  await testTabCloseEndsServer();
  await testSavedCopyIsInert();
  await testApplyGapShowsNoBanner();

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
