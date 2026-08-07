#!/usr/bin/env node
/**
 * server.js — zero-dependency one-shot feedback server for html-visualization.
 *
 * Shared by every mode of the html-visualize workflow (ask, feedback, visualize, …).
 *
 * Usage:
 *   node server.js <html-file> [--port N] [--timeout-sec N] [--no-wait] [--host NAME]...
 *
 * Binds every interface on a random port (or --port N), serves the HTML document
 * at GET /, shared assets at GET /assets/*, accepts authenticated feedback at
 * POST /submit, writes feedback JSON and exits 0 on first successful submit.
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
 * With --no-wait: serves the page and returns immediately (prints only the URL
 * line, no Feedback file line). POST /submit is still accepted for a one-shot
 * submit/close round-trip:
 *   - Non-empty freeform field: writes feedback file, exits 0 (harness re-invokes
 *     Claude which reads the file).
 *   - Empty/missing freeform, or any plain close: exits 0 silently, no file
 *     written (Claude is not re-invoked — normal expected outcome).
 * Timeout (default 1800s) exits 0 silently — same as an empty close.
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

if (args.length === 0 || args[0] === '--help') {
  console.error('Usage: node server.js <html-file> [--port N] [--timeout-sec N] [--no-wait] [--host NAME]...');
  process.exit(1);
}

let htmlFile = null;
let listenPort = 0;
let timeoutSec = 1800;
let noWait = false;
const extraHosts = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    listenPort = parseInt(args[++i], 10);
  } else if (args[i] === '--timeout-sec' && args[i + 1]) {
    timeoutSec = parseInt(args[++i], 10);
  } else if (args[i] === '--no-wait') {
    noWait = true;
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

const csrfToken = crypto.randomBytes(32).toString('base64url');

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
 * Inject the CSRF token into the HTML document.
 * Inserts <script>const CSRF_TOKEN = "...";</script> right before </head>
 * or at the top of <body>, or at the very top if neither is found.
 */
function injectToken(html, token) {
  const snippet = `<script>const CSRF_TOKEN = "${token}";</script>`;
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
    const injected = injectToken(html, csrfToken);
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

  // POST /submit — accept feedback (one-shot in both blocking and --no-wait mode)
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

    // In --no-wait mode: check for a non-empty freeform message.
    // Non-empty means payload.freeform is a string with length > 0 (UI handles trimming).
    // Empty/missing freeform means the user just closed the page — exit silently, no file.
    if (noWait) {
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
  if (!noWait) {
    console.log(`[html-visualization] Feedback file: ${feedbackFile}`);
  }

  // Timeout handler
  const timeoutMs = timeoutSec * 1000;
  setTimeout(() => {
    if (noWait) {
      console.log(`[html-visualization] Display timeout reached after ${timeoutSec}s. Exiting.`);
      process.exit(0);
    } else {
      console.error(`[html-visualization] Timeout: no submission received after ${timeoutSec}s. Exiting non-zero.`);
      process.exit(2);
    }
  // .unref() prevents the timer from keeping the event loop alive on its own.
  // The listening socket already keeps the event loop running; if something
  // closes the server early the timer won't ghost the process.
  }, timeoutMs).unref();
});
