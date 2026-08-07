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
 *   1. Visualize --no-wait: page renders, always-on footer present,
 *      --hv-* CSS tokens resolve in both light and dark colour schemes.
 *   2. Visualize Send trims: a whitespace-only message writes no feedback file
 *      and reports "Closed."; a padded message arrives trimmed.
 *   3. Feedback Apply loop: after an Apply submit the open browser tab
 *      auto-reloads when a fresh fb-generation is served on the same port.
 *   4. Missing shared client: an ask page authored without the
 *      /assets/shared/submit.js tag reports it and disables Submit.
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
const VIS_TMPL  = path.join(REPO_ROOT, 'plugins', 'html-visualization',
                             'skills', 'html-visualize', 'references', 'visualize-template.html');
const FB_TMPL   = path.join(REPO_ROOT, 'plugins', 'html-visualization',
                             'skills', 'html-visualize', 'references', 'feedback-template.html');
const ASK_TMPL  = path.join(REPO_ROOT, 'plugins', 'html-visualization',
                             'skills', 'html-visualize', 'references', 'ask-template.html');

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
function startServer(htmlFile, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const logFile = path.join(os.tmpdir(), `hv-test-browser-${process.pid}-${Date.now()}.log`);
    const logFd   = fs.openSync(logFile, 'w');

    const proc = spawn(process.execPath, [SERVER, htmlFile, ...extraArgs], {
      stdio: ['ignore', logFd, logFd],
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

// ── Test 1: visualize --no-wait ────────────────────────────────────────────
//
// Serves the real visualize-template.html with --no-wait.
// Asserts:
//   a) The page renders (has a <body> with content)
//   b) The always-on footer is present (#vis-message textarea, #vis-send, #vis-save)
//   c) --hv-bg CSS token resolves to a non-empty colour in light scheme
//   d) --hv-bg resolves to a DIFFERENT value in dark scheme

async function testVisualize() {
  console.log('\n--- test: visualize --no-wait ---');
  let srv = null;
  let browser = null;

  try {
    // Create a concrete HTML file from the template (template has placeholders
    // but they are valid HTML and renderable as-is)
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-test-vis-'));
    const htmlFile = path.join(tmpDir, 'test-vis.html');
    fs.copyFileSync(VIS_TMPL, htmlFile);

    srv = await startServer(htmlFile, ['--no-wait', '--timeout-sec', '30']);

    // 1a: Launch in light mode
    browser = await chromium.launch({ headless: true });
    const lightCtx = await browser.newContext({ colorScheme: 'light' });
    const lightPage = await lightCtx.newPage();
    await lightPage.goto(srv.baseUrl + '/');
    await lightPage.waitForLoadState('domcontentloaded');

    // Assert page has a body
    const bodyExists = await lightPage.evaluate(() => !!document.body);
    if (bodyExists) ok('visualize --no-wait: page renders (body exists)');
    else             fail('visualize --no-wait: page body missing');

    // 1b: Footer elements present
    const textareaVisible = await lightPage.locator('#vis-message').isVisible();
    const sendVisible     = await lightPage.locator('#vis-send').isVisible();
    const saveVisible     = await lightPage.locator('#vis-save').isVisible();

    if (textareaVisible) ok('visualize --no-wait: footer textarea (#vis-message) present');
    else                  fail('visualize --no-wait: footer textarea (#vis-message) not visible');

    if (sendVisible) ok('visualize --no-wait: Send button (#vis-send) present');
    else              fail('visualize --no-wait: Send button (#vis-send) not visible');

    if (saveVisible) ok('visualize --no-wait: Save button (#vis-save) present');
    else              fail('visualize --no-wait: Save button (#vis-save) not visible');

    // 1c: --hv-bg resolves in light mode (non-empty, looks like a colour)
    const hvBgLight = await lightPage.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--hv-bg').trim()
    );
    if (hvBgLight) ok('visualize --no-wait: --hv-bg resolves in light mode (' + hvBgLight + ')');
    else            fail('visualize --no-wait: --hv-bg did not resolve in light mode');

    // 1d: --hv-bg is different in dark mode
    const darkCtx  = await browser.newContext({ colorScheme: 'dark' });
    const darkPage = await darkCtx.newPage();
    await darkPage.goto(srv.baseUrl + '/');
    await darkPage.waitForLoadState('domcontentloaded');

    const hvBgDark = await darkPage.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--hv-bg').trim()
    );
    if (hvBgDark) ok('visualize --no-wait: --hv-bg resolves in dark mode (' + hvBgDark + ')');
    else           fail('visualize --no-wait: --hv-bg did not resolve in dark mode');

    if (hvBgLight !== hvBgDark) {
      ok('visualize --no-wait: --hv-bg differs between light (' + hvBgLight + ') and dark (' + hvBgDark + ')');
    } else {
      fail('visualize --no-wait: --hv-bg same in light and dark (' + hvBgLight + ') — tokens not switching');
    }

    await browser.close();
    browser = null;
    killServer(srv);
    srv = null;
    fs.rmSync(tmpDir, { recursive: true, force: true });

  } catch (err) {
    fail('visualize --no-wait: unexpected error — ' + err.message);
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
    // --no-wait, because that is how visualize mode is served (serve.md) and the
    // silent-close branch is --no-wait only: in blocking mode, used by ask and
    // feedback, every submit writes a file by design.
    const srv = await startServer(htmlFile, ['--no-wait', '--timeout-sec', '30']);
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
      // --no-wait suppresses the "Feedback file:" startup line, so derive the path
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

    // ── Round 1: serve with generation "gen-round-1" ──────────────────────
    const fbTmplHtml = fs.readFileSync(FB_TMPL, 'utf8');
    const html1 = fbTmplHtml.replace(
      /(<meta\s+name="fb-generation"\s+content=")[^"]*(")/,
      '$1gen-round-1$2'
    );
    fs.writeFileSync(htmlFile, html1, 'utf8');

    srv1 = await startServer(htmlFile);
    const port = srv1.port;

    // Write the .port file (mirrors the Cycle C contract)
    fs.writeFileSync(path.join(tmpDir, '.port'), String(port), 'utf8');

    // ── Load the page in Chromium ──────────────────────────────────────────
    browser = await chromium.launch({ headless: true });
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(srv1.baseUrl + '/');
    await page.waitForLoadState('domcontentloaded');

    // Verify the page loaded the first generation
    const gen1InPage = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="fb-generation"]');
      return meta ? meta.getAttribute('content') : null;
    });
    if (gen1InPage === 'gen-round-1') {
      ok('feedback Apply-loop: round-1 page loaded with correct fb-generation');
    } else {
      fail('feedback Apply-loop: round-1 fb-generation wrong (expected gen-round-1, got ' + gen1InPage + ')');
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

    // ── Round 2: regenerate with a fresh fb-generation and re-serve same port
    const html2 = fbTmplHtml.replace(
      /(<meta\s+name="fb-generation"\s+content=")[^"]*(")/,
      '$1gen-round-2$2'
    );
    fs.writeFileSync(htmlFile, html2, 'utf8');

    // Wait briefly for the port to be freed, then start the second server
    // on the same port (up to 2 retries as per serve.md contract)
    let srv2Started = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        srv2 = await startServer(htmlFile, ['--port', String(port)]);
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
    // app.js polls GET / every 1s; once it sees a different fb-generation it
    // calls window.location.reload(). The sentinel variable is cleared by reload.
    // Wait up to 10s for the sentinel to disappear.
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
      ok('feedback Apply-loop: open tab auto-reloaded after new fb-generation served');
    } else {
      fail('feedback Apply-loop: open tab did NOT auto-reload within 10s');
    }

    // Verify the reloaded page shows the new generation
    await page.waitForLoadState('domcontentloaded');
    const gen2InPage = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="fb-generation"]');
      return meta ? meta.getAttribute('content') : null;
    }).catch(() => null);

    if (gen2InPage === 'gen-round-2') {
      ok('feedback Apply-loop: reloaded page shows new fb-generation (gen-round-2)');
    } else {
      fail('feedback Apply-loop: reloaded page fb-generation wrong (expected gen-round-2, got ' + gen2InPage + ')');
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
      const srv = await startServer(htmlFile, ['--no-wait', '--timeout-sec', '30']);
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

    srv = await startServer(htmlFile);
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

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  await testVisualize();
  await testVisualizeSubmitTrims();
  await testFeedbackApplyLoop();
  await testMissingSharedClient();
  await testApproachesSingleChoice();

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
