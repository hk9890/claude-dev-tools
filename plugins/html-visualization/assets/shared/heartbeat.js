/**
 * heartbeat.js — the liveness client shared by every mode of html-visualize.
 *
 * Loaded as a plain <script> from /assets/shared/heartbeat.js by the ask and
 * feedback pages. The visualize template carries a verbatim inline copy instead,
 * because a visualize page has to render as a saved file:// document and cannot
 * reference /assets/ — the same arrangement overlay.js already uses.
 *
 * The page is what decides how long the server lives. It proves it is still open
 * by calling GET /ping; the server exits once the pings stop for its grace
 * window. Two consequences shape everything below:
 *
 *   - A ping that fails means the server is gone. That is the signal this file
 *     exists to surface: without it the page looks alive right up until you
 *     click Send and the submit fails, which is exactly the complaint that
 *     motivated the heartbeat.
 *   - The ping answer carries the document's generation, so the same request
 *     that proves liveness also tells a feedback page it has been regenerated.
 *     There is no separate poll.
 *
 * Global:
 *   hvHeartbeat(options) — start the loop. Options, all optional:
 *     controls()     -> [elements]  disabled while disconnected, restored on
 *                                   reconnect (skipping any the page itself
 *                                   disabled for its own reasons).
 *     collectWork()  -> string      whatever the user has typed. Offered as a
 *                                   clipboard copy when the server dies, so the
 *                                   work is not stranded in a page that can no
 *                                   longer submit it.
 *     onGeneration(gen)             called when the served generation differs
 *                                   from the one this page loaded with.
 *     isBusy()       -> boolean     true while the page itself caused the
 *                                   server to go away — a feedback Apply round
 *                                   restarts it. Suppresses the disconnected
 *                                   banner and switches to the fast interval.
 */

'use strict';

/* Idle rate. A ping is a few bytes, but a visualize page can sit open all day. */
var HV_PING_IDLE_MS = 30000;

/* Rate while the page is waiting on a regeneration it asked for. Matches the
 * 1s poll the feedback auto-reload used before the two merged, so an Apply
 * round still reloads about as fast as it always did. */
var HV_PING_FAST_MS = 1000;

/* How often the loop wakes to ask whether a ping is due. Independent of both
 * rates above so a change of rate takes effect within one tick. */
var HV_TICK_MS = 500;

function hvHeartbeat(options) {
  var opts = options || {};
  var token = (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '';
  var myGeneration = (typeof HV_GENERATION !== 'undefined') ? HV_GENERATION : null;

  // No token means no server injected this page: it is a saved copy or a
  // file:// open. There is nothing to ping and nothing to report — starting the
  // loop would 403 against nothing and paint a "disconnected" banner over a page
  // that is working exactly as intended offline.
  if (!token) {
    return { ping: function () {}, isConnected: function () { return false; } };
  }

  var connected = true;
  var banner = null;
  var savedPaddingTop = '';
  var timer = null;
  var lastPingAt = 0;
  /* Elements this file disabled, so a reconnect restores only those and leaves
   * anything the page disabled for its own reasons alone. */
  var disabledByUs = [];

  function isBusy() {
    try { return !!(opts.isBusy && opts.isBusy()); } catch (e) { return false; }
  }

  // ── The disconnected banner ──────────────────────────────────────────────

  function styleOnce() {
    if (document.getElementById('hv-heartbeat-style')) return;
    var style = document.createElement('style');
    style.id = 'hv-heartbeat-style';
    // Tokens with literal fallbacks: this file is inlined into the visualize
    // template too, and must not assume any particular stylesheet loaded.
    style.textContent = [
      '#hv-disconnected{position:fixed;left:0;right:0;top:0;z-index:2147483000;',
      'display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;',
      'padding:.7rem 1rem;font:inherit;font-size:.9rem;line-height:1.4;',
      'background:var(--hv-surface,#fff);color:var(--hv-text,#111);',
      'border-bottom:2px solid var(--hv-accent,#b45309);',
      'box-shadow:0 2px 8px rgba(0,0,0,.18)}',
      '#hv-disconnected strong{font-weight:600}',
      '#hv-disconnected button{font:inherit;font-size:.85rem;padding:.3rem .7rem;',
      'cursor:pointer;border-radius:.35rem;',
      'border:1px solid var(--hv-accent,#b45309);',
      'background:transparent;color:inherit}',
      '#hv-disconnected button:hover{background:var(--hv-accent,#b45309);',
      'color:var(--hv-bg,#fff)}',
    ].join('');
    document.head.appendChild(style);
  }

  function showBanner() {
    if (banner) return;
    styleOnce();
    banner = document.createElement('div');
    banner.id = 'hv-disconnected';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    var text = document.createElement('span');
    text.innerHTML = '<strong>Disconnected.</strong> This page can no longer reach '
      + 'Claude, so nothing on it can be submitted. Ask Claude to serve it again.';
    banner.appendChild(text);

    // The work is stranded in a page that cannot submit it any more, and
    // re-typing it is the actual cost of the server going away. Offer it back.
    var work = '';
    try { work = (opts.collectWork && opts.collectWork()) || ''; } catch (e) { work = ''; }
    if (work) {
      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy what I typed';
      copyBtn.addEventListener('click', function () {
        // Re-collect at click time: the page stays readable while disconnected,
        // so what was typed may have changed since the banner appeared.
        var latest = '';
        try { latest = (opts.collectWork && opts.collectWork()) || work; } catch (e) { latest = work; }
        hvHeartbeatCopy(copyBtn, latest);
      });
      banner.appendChild(copyBtn);
    }

    document.body.appendChild(banner);

    // Push the document down rather than covering it. The banner is fixed to the
    // top, and at scroll-top it would otherwise sit over the page header —
    // hiding the title of the very page it is talking about.
    savedPaddingTop = document.body.style.paddingTop;
    document.body.style.paddingTop =
      (banner.getBoundingClientRect().height || 0) + 'px';
  }

  function hideBanner() {
    if (!banner) return;
    if (banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
    document.body.style.paddingTop = savedPaddingTop;
    savedPaddingTop = '';
  }

  // ── Connection state ─────────────────────────────────────────────────────

  function goDisconnected() {
    // A page that knowingly asked the server to restart is not disconnected,
    // it is waiting. Reporting it as dead every Apply round would be a lie.
    if (!connected || isBusy()) return;
    connected = false;
    var controls = [];
    try { controls = (opts.controls && opts.controls()) || []; } catch (e) { controls = []; }
    disabledByUs = [];
    for (var i = 0; i < controls.length; i++) {
      var el = controls[i];
      if (el && !el.disabled) {
        el.disabled = true;
        disabledByUs.push(el);
      }
    }
    showBanner();
  }

  function goConnected() {
    if (connected) return;
    connected = true;
    for (var i = 0; i < disabledByUs.length; i++) {
      disabledByUs[i].disabled = false;
    }
    disabledByUs = [];
    hideBanner();
  }

  // ── The ping itself ──────────────────────────────────────────────────────

  function pingOnce() {
    return fetch('/ping', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'X-CSRF-Token': token },
    })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json().catch(function () { return null; });
      })
      .catch(function () { return null; })
      .then(function (body) {
        if (!body) { goDisconnected(); return; }
        goConnected();
        if (myGeneration !== null
            && body.generation
            && body.generation !== myGeneration
            && opts.onGeneration) {
          opts.onGeneration(body.generation);
        }
      });
  }

  // A cheap fixed ticker that decides on each tick whether a ping is due, rather
  // than an interval set to the ping rate. Rescheduling an interval only works
  // if something re-runs it when the rate should change, and the only thing that
  // could is the interval itself — so entering the busy state would not take
  // effect until the *idle* interval had elapsed, leaving a feedback Apply round
  // waiting up to a full 30s for a reload that should land in about a second.
  function tick() {
    var delay = isBusy() ? HV_PING_FAST_MS : HV_PING_IDLE_MS;
    if (Date.now() - lastPingAt < delay) return;
    lastPingAt = Date.now();
    pingOnce();
  }

  function schedule() {
    if (timer !== null) return;
    timer = setInterval(tick, HV_TICK_MS);
  }

  // ── Tab close ────────────────────────────────────────────────────────────

  window.addEventListener('pagehide', function (ev) {
    // bfcache: the page is being frozen, not closed, and may come straight back
    // when the user hits Back. Telling the server goodbye would kill a page the
    // user is about to return to.
    if (ev.persisted) return;
    if (!token) return;
    try {
      var payload = new Blob([JSON.stringify({ token: token })], { type: 'application/json' });
      navigator.sendBeacon('/bye', payload);
    } catch (e) {
      // Best effort. When the beacon does not make it the server still notices
      // on its own once the pings stop — slower, but never wrong.
    }
  });

  // Coming back to a backgrounded tab is exactly when the answer matters, and
  // the browser may have throttled the interval to nothing while it was hidden.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') pingOnce();
  });

  schedule();
  lastPingAt = Date.now();
  pingOnce();

  return {
    ping: pingOnce,
    isConnected: function () { return connected; },
  };
}

/* Self-contained so the inline copy in the visualize template needs nothing
 * else; submit.js has its own near-identical helper for the Copy feedback
 * button, which restores a different label. */
function hvHeartbeatCopy(button, text) {
  function done() {
    button.textContent = 'Copied!';
    setTimeout(function () { button.textContent = 'Copy what I typed'; }, 2000);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { hvHeartbeatFallbackCopy(text, done); });
  } else {
    hvHeartbeatFallbackCopy(text, done);
  }
}

function hvHeartbeatFallbackCopy(text, onSuccess) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.top = '-9999px';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    onSuccess();
  } catch (e) {
    // Both clipboard paths failed; nothing actionable to do silently.
  }
  document.body.removeChild(ta);
}
