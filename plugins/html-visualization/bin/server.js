#!/usr/bin/env node
/**
 * server.js — zero-dependency one-shot feedback server for html-visualization.
 *
 * Shared by every mode of the html-visualize workflow (ask, feedback, visualize, …).
 *
 * Usage:
 *   node server.js <html-file> --mode ask|feedback|visualize
 *                  [--port N] [--grace-sec N] [--host NAME]...
 *
 * Binds every interface on a random port (or --port N), serves the HTML document
 * at GET /, shared assets at GET /assets/*, answers a liveness heartbeat at
 * GET /ping, accepts authenticated feedback at POST /submit, writes feedback
 * JSON and exits 0 on first successful submit.
 *
 * The bind is all-interfaces so the page is reachable from another machine —
 * a laptop opening a page served by a remote dev box over SSH, addressed by the
 * host's DNS name. The printed URL therefore uses os.hostname(), not loopback.
 * Consequence: anyone who can reach the port can read the page and submit
 * through it. GET / hands out the CSRF token, so that token authenticates the
 * page, not the person — reachability is the whole access boundary.
 *
 * POST /submit narrows that boundary on one axis: the request must address this
 * machine by a name it actually answers as (see "Host allow-list" below). Pass
 * --host NAME, repeatable, to add a name the allow-list cannot derive — an alias,
 * an mDNS/VPN name, or the public host of a TLS-terminating forwarder.
 *
 * os.hostname() is advertised as-is; whether it resolves for the client is the
 * environment's business, not this server's. When it does not (a container ID,
 * a box reached through an SSH tunnel), the same port on loopback still serves
 * the page — see the fallback guidance in references/serve.md.
 *
 * Lifetime is driven by the page, not by a clock. The served page sends an
 * authenticated GET /ping every 30s (every 1s while a feedback Apply round is in
 * flight); the server exits once no valid ping has arrived for --grace-sec
 * (default 900). The clock starts at startup, so a link nobody ever opens dies
 * on the same rule as a page that was opened and then abandoned.
 *
 * Only a ping carrying the CSRF token counts. Without that gate any port scanner
 * touching /ping would hold the server open forever, and there is no fixed
 * timeout left to backstop it.
 *
 * POST /bye is the tab-close beacon. It does not exit the process — it schedules
 * a close, which any tab still open cancels by pinging. That is what makes
 * closing one of two open tabs safe, and it is why the window is 90s: a
 * backgrounded tab has its timers throttled and may only ping once a minute.
 *
 * --mode selects what an abandoned page means:
 *   - visualize: the submit was always optional, so abandonment exits 0 silently.
 *   - ask, feedback: the round-trip was the point, so abandonment exits 2 with no
 *     feedback file, and Claude reports the page was closed without a submit.
 *
 * POST /submit is one-shot in every mode:
 *   - visualize with a non-empty freeform field: writes feedback file, exits 0
 *     (the harness re-invokes Claude, which reads the file).
 *   - visualize with empty/missing freeform: exits 0 silently, no file written.
 *   - ask and feedback: every submit writes a file by design.
 *
 * "Non-empty freeform" means payload.freeform is a string with length > 0.
 * Trimming is the UI's responsibility; the server checks the raw value.
 *
 * The server is schema-agnostic: it accepts any JSON object as the POST /submit
 * body and writes it back verbatim (plus a server-stamped submittedAt). Each
 * skill defines and validates its own payload shape client-side.
 *
 * Uses only Node built-in modules — no npm dependencies.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// ── Parse CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const USAGE = 'Usage: node server.js <html-file> --mode ask|feedback|visualize '
            + '[--port N] [--grace-sec N] [--host NAME]...';

const MODES = ['ask', 'feedback', 'visualize'];

if (args.length === 0 || args[0] === '--help') {
  console.error(USAGE);
  process.exit(1);
}

let htmlFile = null;
let listenPort = 0;
let graceSec = 900;
let mode = null;
const extraHosts = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    listenPort = parseInt(args[++i], 10);
  } else if (args[i] === '--grace-sec' && args[i + 1]) {
    graceSec = parseInt(args[++i], 10);
  } else if (args[i] === '--mode' && args[i + 1]) {
    mode = args[++i];
  } else if (args[i] === '--host' && args[i + 1]) {
    extraHosts.push(args[++i]);
  } else if (!args[i].startsWith('--')) {
    htmlFile = args[i];
  }
}

if (!htmlFile) {
  console.error('Error: <html-file> argument is required');
  process.exit(1);
}

// --mode is required rather than defaulted: it decides whether abandoning the
// page is silent or is reported to Claude, and guessing wrong in either
// direction is worse than refusing to start.
if (!mode) {
  console.error('Error: --mode is required (one of: ' + MODES.join(', ') + ')');
  console.error(USAGE);
  process.exit(1);
}
if (!MODES.includes(mode)) {
  console.error(`Error: --mode value is not a mode: ${mode} (expected one of: ${MODES.join(', ')})`);
  process.exit(1);
}

if (!Number.isFinite(graceSec) || graceSec <= 0) {
  console.error('Error: --grace-sec must be a positive number of seconds');
  process.exit(1);
}

// visualize is the one mode whose submit was always optional, so it is the one
// mode where closing the page without submitting is a normal ending rather than
// something Claude should report.
const submitOptional = mode === 'visualize';

// Resolve to absolute path
htmlFile = path.resolve(htmlFile);

if (!fs.existsSync(htmlFile)) {
  console.error(`Error: HTML file not found: ${htmlFile}`);
  process.exit(1);
}

// ── Paths ──────────────────────────────────────────────────────────────────

// Assets dir is always relative to this script, not cwd
const assetsDir = path.resolve(__dirname, '..', 'assets');

// Feedback file: <html-file-dir>/<basename-without-ext>.feedback.json
const htmlBasename = path.basename(htmlFile, path.extname(htmlFile));
const feedbackFile = path.join(path.dirname(htmlFile), `${htmlBasename}.feedback.json`);

// ── CSRF token ─────────────────────────────────────────────────────────────

// Persisted beside the HTML rather than minted per process. Feedback mode
// restarts this server on the same port for every Apply round, and a fresh token
// each round would invalidate the one already injected into the open tab: its
// pings would 403, the new server would credit no liveness, and it would count
// down to exit with a live page sitting in front of it.
//
// Mode 0600 because the token is now at rest in a temp directory, where the
// default umask would otherwise leave it world-readable. It still only proves a
// request came from the served page, not who sent it.
const csrfFile = path.join(path.dirname(htmlFile), '.csrf');

function loadOrMintToken() {
  try {
    const existing = fs.readFileSync(csrfFile, 'utf8').trim();
    if (existing) return existing;
  } catch (_) {
    // No token yet — first serve for this directory. Mint one below.
  }
  const minted = crypto.randomBytes(32).toString('base64url');
  try {
    fs.writeFileSync(csrfFile, minted, { encoding: 'utf8', mode: 0o600 });
    // writeFileSync honours `mode` only when it creates the file, so an existing
    // file with looser bits would otherwise keep them.
    fs.chmodSync(csrfFile, 0o600);
  } catch (err) {
    console.error(`[html-visualization] Warning: could not persist the CSRF token to ${csrfFile}: ${err.message}`);
    console.error('[html-visualization] Continuing with a process-local token; an open tab will need a manual reload after a re-serve.');
  }
  return minted;
}

const csrfToken = loadOrMintToken();

// ── Generation ─────────────────────────────────────────────────────────────

// The served document's mtime in milliseconds, handed to the page at load and
// reported by GET /ping so an open tab can tell it has been regenerated.
//
// Claude used to author a unique fb-generation value into the HTML itself, and a
// reused value silently meant the tab never reloaded. The filesystem already
// tracks exactly this fact, so the server reads it rather than trusting the
// document to carry it.
function currentGeneration() {
  const stat = fs.statSync(htmlFile, { throwIfNoEntry: false });
  return stat ? String(stat.mtimeMs) : '0';
}

// ── Host allow-list ────────────────────────────────────────────────────────

/**
 * Canonicalize a Host-header-shaped value to a bare hostname: drops the port,
 * lowercases, unwraps [..] around an IPv6 literal and compresses it, and strips
 * an IPv6 zone id. Returns null for anything that will not parse.
 */
function normalizeHost(value) {
  const withoutZone = String(value).replace(/%[^\]\s:]+/, '');
  let hostname;
  try {
    hostname = new URL(`http://${withoutZone}`).hostname;
  } catch (_) {
    return null;
  }
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }
  return hostname || null;
}

// The names this machine answers as. A submit must address one of them.
//
// Why: the bind is all-interfaces, so the server answers to *every* name that
// resolves here — including one an attacker owns. A page at attacker.com whose
// DNS re-resolves to this host reaches us with Host: attacker.com and an Origin
// that agrees with it, and the browser calls it same-origin, so the Origin check
// below — which is deliberately host-relative — passes on its own. Pinning Host
// to this list is what that check cannot do for itself: the attacker's name is
// not on it. This is the DNS-rebinding defence, not a general access control;
// anyone who can reach the port still reads the page.
const allowedHosts = new Set();

// '[::1]' is bracketed because that is the only form a URL — and therefore a
// Host header — carries an IPv6 literal in. A bare '::1' does not parse and
// would seed nothing.
for (const name of ['localhost', '127.0.0.1', '[::1]', os.hostname()]) {
  const normalized = normalizeHost(name);
  if (normalized) allowedHosts.add(normalized);
}

for (const addresses of Object.values(os.networkInterfaces())) {
  for (const iface of addresses || []) {
    const normalized = normalizeHost(iface.family === 'IPv6' ? `[${iface.address}]` : iface.address);
    if (normalized) allowedHosts.add(normalized);
  }
}

// A --host typo would otherwise surface as a 403 at submit time, long after the
// user could connect it to what they typed. Fail at startup instead.
for (const name of extraHosts) {
  const normalized = normalizeHost(name);
  if (!normalized) {
    console.error(`Error: --host value is not a hostname: ${name}`);
    process.exit(1);
  }
  allowedHosts.add(normalized);
}

// ── State ──────────────────────────────────────────────────────────────────

let accepted = false; // true after first valid POST /submit

// Liveness clock. Seeded at startup so a link nobody ever opens expires on the
// same rule as a page that was opened and then abandoned — one lifetime number,
// no separate "never opened" case.
let lastSeen = Date.now();

// Set by POST /bye, cleared by any valid ping. Non-null means "a tab said it was
// closing; exit at this time unless someone proves otherwise".
let closingDeadline = null;

// How often the liveness clock is checked. Capped at half the grace so a short
// --grace-sec still expires promptly instead of waiting out a fixed sweep.
const SWEEP_MS = Math.max(250, Math.min(10 * 1000, (graceSec * 1000) / 2));

// How long a tab-close beacon leaves before exiting. The beacon only says "one
// tab went away", and the way a second, still-open tab objects is by pinging —
// so this MUST outlast that tab's ping interval, or closing one of two tabs
// reliably kills the page in the other. That is the whole reason the beacon is
// routed through the clock instead of exiting directly.
//
// 90s, not the 30s idle interval plus a margin: a tab hidden for more than about
// five minutes has its timers throttled to roughly one tick per minute, so the
// surviving tab may be pinging at ~60s rather than 30s. Sizing this to the
// unthrottled rate would leave exactly that tab — backgrounded, still wanted —
// as the one the beacon kills.
//
// Never longer than the grace itself, so it can only ever shorten a lifetime.
//
// HV_BEACON_WINDOW_MS overrides it for tests only. The window has to outlast the
// ping interval in production, which makes "did the beacon fire, or did the page
// simply go quiet?" untestable at any grace short enough to run in a suite —
// they expire together. Nothing but the test suite sets this.
const BEACON_WINDOW_MS = Number(process.env.HV_BEACON_WINDOW_MS)
  || Math.min(90 * 1000, graceSec * 1000);

const graceMs = graceSec * 1000;

/**
 * Exit if nobody is watching any more — either a tab announced it was closing
 * and nothing has pinged since, or the pings simply stopped for the whole grace.
 *
 * Run both on the periodic sweep and, when a beacon arrives, on a timer armed
 * for that beacon's own deadline: the sweep alone would leave a closed page's
 * port open until the next tick, which is up to SWEEP_MS later than it needs to
 * be for the one case where the page told us exactly when it was going.
 */
function checkLiveness() {
  const closing = closingDeadline !== null && Date.now() >= closingDeadline;
  const silent  = Date.now() - lastSeen >= graceMs;
  if (!closing && !silent) return;
  const why = closing ? 'the page was closed' : `no heartbeat for ${graceSec}s`;
  if (submitOptional) {
    console.log(`[html-visualization] Exiting 0 — ${why}.`);
    process.exit(0);
  }
  console.error(`[html-visualization] Exiting non-zero — ${why} without a submit.`);
  process.exit(2);
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

function jsonResponse(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function timingSafeEqual(a, b) {
  // If lengths differ it can't match; but still do a constant-time compare on
  // equal-length buffers (pad shorter one) to avoid leaking length via timing.
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Do a dummy compare to keep timing consistent, then return false
    const dummy = Buffer.alloc(bufA.length, 0);
    try { crypto.timingSafeEqual(bufA, dummy); } catch (_) {}
    return false;
  }
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (_) {
    return false;
  }
}

function serveFile(res, filePath, contentType) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) {
    jsonResponse(res, 404, { error: 'not found' });
    return;
  }
  const data = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': data.length,
  });
  res.end(data);
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Inject the per-serve constants into the HTML document, right before </head>
 * or at the top of <body>, or at the very top if neither is found.
 *
 * All three live in one <script> block on purpose: visualize mode's Save button
 * strips every script that mentions CSRF_TOKEN when it clones the DOM, so
 * bundling them here keeps the heartbeat constants out of a saved offline copy
 * too. A saved page that kept them would ping a host that is long gone.
 */
function injectConstants(html, token, generation) {
  const snippet = '<script>'
    + `const CSRF_TOKEN = ${JSON.stringify(token)};`
    + `const HV_GENERATION = ${JSON.stringify(generation)};`
    + `const HV_MODE = ${JSON.stringify(mode)};`
    + '</script>';
  if (html.includes('</head>')) {
    return html.replace('</head>', `${snippet}\n</head>`);
  } else if (html.includes('<body')) {
    // Insert after the opening <body ...> tag
    return html.replace(/(<body[^>]*>)/, `$1\n${snippet}`);
  } else {
    return snippet + '\n' + html;
  }
}

// ── Request handler ────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://127.0.0.1`);
  const pathname = url.pathname;

  // GET / — serve HTML with injected token
  if (req.method === 'GET' && pathname === '/') {
    let html;
    try {
      html = fs.readFileSync(htmlFile, 'utf8');
    } catch (err) {
      jsonResponse(res, 500, { error: 'could not read HTML file' });
      return;
    }
    // Serving the page deliberately does not credit liveness: GET / is
    // unauthenticated so the document is reachable, which means anything that
    // can reach the port could otherwise hold the server open by fetching it.
    // Only an authenticated ping counts.
    const injected = injectConstants(html, csrfToken, currentGeneration());
    const body = Buffer.from(injected, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
    });
    res.end(body);
    return;
  }

  // GET /assets/* — serve a static asset
  if (req.method === 'GET' && pathname.startsWith('/assets/')) {
    const requestedSuffix = pathname.slice('/assets/'.length);

    // Decode percent-encoding and resolve to catch traversal
    let resolved;
    try {
      resolved = path.resolve(assetsDir, decodeURIComponent(requestedSuffix));
    } catch (_) {
      jsonResponse(res, 404, { error: 'not found' });
      return;
    }

    // Reject path traversal: resolved path must be inside assetsDir
    if (!resolved.startsWith(assetsDir + path.sep) && resolved !== assetsDir) {
      jsonResponse(res, 404, { error: 'not found' });
      return;
    }

    const contentType = guessContentType(resolved);
    serveFile(res, resolved, contentType);
    return;
  }

  // GET /ping — liveness heartbeat, and the current generation so an open tab
  // can notice it has been regenerated.
  //
  // Token-gated: with no fixed timeout left to backstop it, an open endpoint
  // here would let any scanner or monitoring probe on the network hold the
  // server alive forever just by touching it.
  if (req.method === 'GET' && pathname === '/ping') {
    const headerToken = req.headers['x-csrf-token'] || '';
    if (!timingSafeEqual(headerToken, csrfToken)) {
      jsonResponse(res, 403, { error: 'forbidden' });
      return;
    }
    lastSeen = Date.now();
    // A live tab overrides another tab's close beacon.
    closingDeadline = null;
    jsonResponse(res, 200, { ok: true, generation: currentGeneration() });
    return;
  }

  // POST /bye — the tab-close beacon, sent by navigator.sendBeacon on pagehide.
  //
  // sendBeacon cannot set request headers, so the token travels in the body.
  //
  // This deliberately does not exit the process. It shortens the liveness clock
  // and lets the sweep decide, so closing one of two open tabs cannot take the
  // page away from the other — any tab still alive re-arms the clock with its
  // next ping. The window has to exceed the client's idle ping interval for that
  // to actually work; see BEACON_WINDOW_MS.
  if (req.method === 'POST' && pathname === '/bye') {
    let rawBody = '';
    try {
      rawBody = await readBody(req);
    } catch (_) {
      // Unreadable body cannot carry a valid token; fall through to the 403.
    }
    let beaconToken = '';
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === 'object' && typeof parsed.token === 'string') {
        beaconToken = parsed.token;
      }
    } catch (_) {
      // Malformed beacon body — treated as an unauthenticated request.
    }
    if (!timingSafeEqual(beaconToken, csrfToken)) {
      jsonResponse(res, 403, { error: 'forbidden' });
      return;
    }
    const deadline = Date.now() + BEACON_WINDOW_MS;
    // Never push out a close another tab already scheduled.
    if (closingDeadline === null || deadline < closingDeadline) closingDeadline = deadline;
    // Check at the deadline itself rather than waiting for the next sweep.
    setTimeout(checkLiveness, BEACON_WINDOW_MS + 50).unref();
    jsonResponse(res, 200, { ok: true });
    return;
  }

  // POST /submit — accept feedback (one-shot in every mode)
  if (req.method === 'POST' && pathname === '/submit') {
    // 410 if already submitted
    if (accepted) {
      jsonResponse(res, 410, { error: 'already submitted' });
      return;
    }

    // Validate CSRF token
    const headerToken = req.headers['x-csrf-token'] || '';
    if (!timingSafeEqual(headerToken, csrfToken)) {
      jsonResponse(res, 403, { error: 'forbidden' });
      return;
    }

    // Validate Origin / Sec-Fetch-Site (conditional — only checked if present)
    const secFetchSite = req.headers['sec-fetch-site'];
    if (secFetchSite !== undefined && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
      jsonResponse(res, 403, { error: 'forbidden' });
      return;
    }

    // Pin Host to a name this machine actually answers as, before the Origin
    // comparison below trusts it. See the allow-list note at the top of the
    // file: that comparison is host-relative, so on its own it agrees with
    // whatever name a rebound page used.
    //
    // Gated here and not on GET /, so a page reached under an unlisted alias
    // still displays — only the request Claude acts on has to name this host.
    const requestHost = normalizeHost(req.headers['host'] || '');
    if (!requestHost || !allowedHosts.has(requestHost)) {
      // Log the normalized value, never the raw header — it is attacker-supplied.
      console.error(
        `[html-visualization] Submit refused: Host "${requestHost || '(unparseable)'}" is not a name this machine answers as. ` +
        'Pass --host <name> to allow it.'
      );
      jsonResponse(res, 403, { error: 'forbidden' });
      return;
    }

    // The server binds every interface, so it answers to every name that
    // resolves to this host — there is no single origin string to compare
    // against. Same-origin means the Origin names the same host the browser
    // actually addressed; a cross-site post carries a foreign host and fails.
    //
    // Compare hosts, not whole origins: a TLS-terminating forwarder (Codespaces,
    // VS Code forwarded ports, Tailscale Serve, ngrok) gives the browser an
    // https:// page while this server still speaks http, so matching the scheme
    // too would 403 every submit made through one.
    const origin = req.headers['origin'];
    if (origin !== undefined) {
      const host = req.headers['host'];
      let originHost = null;
      try {
        originHost = new URL(origin).host;
      } catch (_) {
        // Unparseable, or the literal "null" a sandboxed iframe sends.
      }
      if (!host || originHost !== host) {
        jsonResponse(res, 403, { error: 'forbidden' });
        return;
      }
    }

    // Validate Content-Type
    const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
    if (contentType !== 'application/json') {
      jsonResponse(res, 400, { error: 'Content-Type must be application/json' });
      return;
    }

    // Read body
    let rawBody;
    try {
      rawBody = await readBody(req);
    } catch (_) {
      jsonResponse(res, 400, { error: 'could not read request body' });
      return;
    }

    // Parse JSON
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (_) {
      jsonResponse(res, 400, { error: 'invalid JSON body' });
      return;
    }

    // The body must be a plain JSON object. The server is schema-agnostic —
    // each skill owns its own payload shape — but it always writes an object.
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      jsonResponse(res, 400, { error: 'request body must be a JSON object' });
      return;
    }

    // Mark as accepted immediately to block duplicate submits
    accepted = true;

    // In visualize mode: check for a non-empty freeform message.
    // Non-empty means payload.freeform is a string with length > 0 (UI handles trimming).
    // Empty/missing freeform means the user just closed the page — exit silently, no file.
    if (submitOptional) {
      const hasFreeform = typeof payload.freeform === 'string' && payload.freeform.length > 0;

      if (!hasFreeform) {
        // Silent close: user dismissed without sending a message. Exit 0, no file.
        const okBody = JSON.stringify({ ok: true, written: false });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(okBody),
        });
        res.end(okBody, () => {
          setTimeout(() => {
            process.exit(0);
          }, 250);
        });
        return;
      }
    }

    // Build feedback object: the server stamps submittedAt; every field from
    // the request body is passed through verbatim.
    const feedback = { submittedAt: new Date().toISOString(), ...payload };

    // Atomic write: write to temp path, then rename
    const tmpPath = `${feedbackFile}.tmp`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(feedback, null, 2), 'utf8');
      fs.renameSync(tmpPath, feedbackFile);
    } catch (err) {
      // Undo accepted flag so caller can try again? No — better to fail loudly
      // and avoid partial state. Return 500 but don't exit.
      accepted = false;
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      jsonResponse(res, 500, { error: 'failed to write feedback file' });
      return;
    }

    // Respond success
    const okBody = JSON.stringify({ ok: true });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(okBody),
    });
    res.end(okBody, () => {
      // Brief delay so the 200 flushes before exit; also gives a tiny window
      // for a racing duplicate POST to receive 410.
      setTimeout(() => {
        console.log(`[html-visualization] Feedback written to: ${feedbackFile}`);
        console.log('[html-visualization] Exiting 0.');
        process.exit(0);
      }, 250);
    });
    return;
  }

  // Catch-all 404
  jsonResponse(res, 404, { error: 'not found' });
}

// ── Server startup ─────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[html-visualization] Unhandled error:', err);
    try {
      jsonResponse(res, 500, { error: 'internal server error' });
    } catch (_) {}
  });
});

// No host argument: Node binds :: with dual-stack where the OS supports it, so
// a hostname that resolves to AAAA works too. Passing '0.0.0.0' would be
// IPv4-only, and the URL below advertises a name whose address family is not
// ours to predict.
server.listen(listenPort, () => {
  const { port } = server.address();
  // Address the page by the host's own name so the link works from another
  // machine; a local browser resolves it too.
  const url = `http://${os.hostname()}:${port}/`;
  console.log(`[html-visualization] URL: ${url}`);
  if (!submitOptional) {
    console.log(`[html-visualization] Feedback file: ${feedbackFile}`);
  }

  // Liveness sweep. The page proves it is still open by pinging; once the pings
  // stop for --grace-sec there is nobody watching, and no reason to keep a port
  // open on every interface.
  // .unref() prevents the timer from keeping the event loop alive on its own.
  // The listening socket already keeps the event loop running; if something
  // closes the server early the timer won't ghost the process.
  setInterval(checkLiveness, SWEEP_MS).unref();
});
