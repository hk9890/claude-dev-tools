/**
 * submit.js — the /submit client shared by the ask and feedback modes.
 *
 * Loaded as a plain <script> from /assets/shared/submit.js, before the mode's
 * own app.js; each function below is a browser global that app.js calls. It is
 * never require()d — the mode app.js files carry the Node-testable payload
 * builders, this file only talks to the DOM and the network.
 *
 * Globals:
 *   hvSubmit(payload, handlers) — POST the payload to /submit with the
 *     server-injected CSRF token, then call exactly one of:
 *       handlers.accepted()                 — 200, the server took it
 *       handlers.alreadySubmitted()         — 410, a submit already landed
 *       handlers.failed(status, errorText)  — any other status
 *       handlers.unreachable()              — the request never completed
 *     unreachable() covers the network phase only. An exception thrown by a
 *     handler rejects the returned promise — it must not be reported as an
 *     unreachable server, because by then the submit has already landed.
 *   hvCopy(button, text)     — copy text to the clipboard, then flip the button
 *                              into its transient "Copied!" state
 *   hvShowError(el, message) / hvClearError(el) — the .submit-error panel
 */

'use strict';

function hvSubmit(payload, handlers) {
  var token = (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '';

  // The network phase resolves to an outcome; the dispatch phase runs the
  // handler. They are separate .then()s so the .catch between them cannot see
  // an exception thrown by a handler and mis-report a landed submit as an
  // unreachable server.
  return fetch('/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify(payload),
  })
    .then(function (res) {
      if (res.status === 200 || res.status === 410) {
        return { status: res.status, error: '' };
      }
      return res.json().then(
        function (body) { return { status: res.status, error: body.error || 'unknown error' }; },
        function () { return { status: res.status, error: 'unknown error' }; }
      );
    })
    .catch(function () {
      return null;
    })
    .then(function (outcome) {
      if (!outcome) {
        handlers.unreachable();
      } else if (outcome.status === 200) {
        handlers.accepted();
      } else if (outcome.status === 410) {
        handlers.alreadySubmitted();
      } else {
        handlers.failed(outcome.status, outcome.error);
      }
    });
}

function hvCopy(button, text) {
  // Both templates label this button "Copy feedback"; restoring the literal,
  // rather than the text read at click time, keeps a second click within the
  // 2s window from making "Copied!" permanent.
  function markCopied() {
    button.textContent = 'Copied!';
    button.classList.add('copied');
    setTimeout(function () {
      button.textContent = 'Copy feedback';
      button.classList.remove('copied');
    }, 2000);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(markCopied).catch(function () {
      hvFallbackCopy(text, markCopied);
    });
  } else {
    hvFallbackCopy(text, markCopied);
  }
}

function hvFallbackCopy(text, onSuccess) {
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
    // If both clipboard paths fail, nothing actionable we can do silently
  }
  document.body.removeChild(ta);
}

function hvShowError(el, message) {
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
  }
}

function hvClearError(el) {
  if (el) {
    el.textContent = '';
    el.style.display = 'none';
  }
}
