/**
 * app.js — browser-side interaction layer for html-ask.
 *
 * Exports (UMD-compatible, testable in Node without a DOM):
 *   buildFeedbackPayload(state) → { verdict, answers, comments, freeform }
 *
 * DOM wiring (only runs when document is available):
 *   - Collects answers from .widget[data-qid] elements.
 *   - Renders an always-visible free-text note field on each .annotatable widget.
 *   - Reads CSRF_TOKEN global injected by server.
 *   - POSTs to /submit and handles 200 / 410 / other responses.
 *   - "Copy feedback" button copies the exact /submit JSON payload.
 *
 * Widget vocabulary (full contract in markup.md):
 *   data-qid       — question ID; non-empty, printable ASCII, no whitespace
 *   data-qtype     — text | radio | checkbox | approaches
 *   data-anchor-id — base value used as CSS selector anchor (#<value>)
 *   .annotatable   — widget that gets an always-visible free-text note field
 */

'use strict';

// ── Pure payload builder ────────────────────────────────────────────────────
//
// state shape:
//   {
//     verdict: string,                              // one of the three allowed values
//     answers: { [qID]: value },                    // question-ID -> answer value
//     comments: [ { anchor: string, text: string } ], // inline comments (non-empty text only)
//     freeform: string                              // overall free-text (may be empty string)
//   }
//
// Returns the exact /submit request body:
//   { verdict, answers, comments, freeform }
//
// Enforces: zero-length comment texts are filtered OUT (per submit-schema.md).
// Does NOT validate verdict enum — the server owns that check.

function buildFeedbackPayload(state) {
  var verdict = state.verdict == null ? '' : String(state.verdict);
  var answers = state.answers && typeof state.answers === 'object' ? state.answers : {};
  var freeform = state.freeform == null ? '' : String(state.freeform);

  // Filter out comments with empty text (schema: "MUST omit zero-length comments")
  var rawComments = Array.isArray(state.comments) ? state.comments : [];
  var comments = [];
  for (var i = 0; i < rawComments.length; i++) {
    var c = rawComments[i];
    if (c && typeof c.anchor === 'string' && typeof c.text === 'string' && c.text.length > 0) {
      comments.push({ anchor: c.anchor, text: c.text });
    }
  }

  return {
    verdict: verdict,
    answers: answers,
    comments: comments,
    freeform: freeform,
  };
}

// ── UMD export — allows require() in Node for unit testing ─────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildFeedbackPayload: buildFeedbackPayload };
}

// ── DOM wiring — only runs in a browser ────────────────────────────────────

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {

    // ── Helpers ─────────────────────────────────────────────────────────────

    function getById(id) {
      return document.getElementById(id);
    }

    function show(el) {
      if (el) el.style.display = '';
    }

    function hide(el) {
      if (el) el.style.display = 'none';
    }

    // ── Read answers from widgets ───────────────────────────────────────────

    function collectAnswers() {
      var answers = {};
      var widgets = document.querySelectorAll('.widget[data-qid]');
      widgets.forEach(function (widget) {
        var qid = widget.getAttribute('data-qid');
        var qtype = widget.getAttribute('data-qtype') || 'text';

        if (qtype === 'text') {
          var ta = widget.querySelector('textarea');
          answers[qid] = ta ? ta.value : '';

        } else if (qtype === 'radio') {
          var checked = widget.querySelector('input[type="radio"]:checked');
          answers[qid] = checked ? checked.value : null;

        } else if (qtype === 'checkbox') {
          var checkboxes = widget.querySelectorAll('input[type="checkbox"]:checked');
          var vals = [];
          checkboxes.forEach(function (cb) { vals.push(cb.value); });
          answers[qid] = vals;

        } else if (qtype === 'approaches') {
          // Per-column verdict stored as answers[qid+"-"+colIndex]
          // The approaches widget stores each column's verdict under a sub-key.
          // Columns must carry data-approach-id on the .approach-col element.
          var cols = widget.querySelectorAll('.approach-col[data-approach-id]');
          cols.forEach(function (col) {
            var aid = col.getAttribute('data-approach-id');
            var colKey = qid + '-' + aid;
            var checkedRadio = col.querySelector('input[type="radio"]:checked');
            answers[colKey] = checkedRadio ? checkedRadio.value : null;
          });
        }
      });
      return answers;
    }

    // ── Read overall verdict ────────────────────────────────────────────────

    function collectVerdict() {
      var checked = document.querySelector('.widget-verdict input[type="radio"]:checked');
      return checked ? checked.value : '';
    }

    // ── Read freeform ───────────────────────────────────────────────────────

    function collectFreeform() {
      var ta = document.getElementById('freeform-input');
      return ta ? ta.value : '';
    }

    // ── Read per-question notes ─────────────────────────────────────────────
    // Each .annotatable widget has an always-visible note <textarea>; a
    // non-empty note becomes one { anchor, text } entry in the comments array.

    function collectComments() {
      var list = [];
      document
        .querySelectorAll('textarea.widget-note-input[data-note-anchor]')
        .forEach(function (ta) {
          var text = ta.value.trim();
          if (text.length > 0) {
            list.push({ anchor: ta.getAttribute('data-note-anchor'), text: text });
          }
        });
      return list;
    }

    // ── Build state and payload ─────────────────────────────────────────────

    function buildCurrentState() {
      return {
        verdict: collectVerdict(),
        answers: collectAnswers(),
        comments: collectComments(),
        freeform: collectFreeform(),
      };
    }

    function buildCurrentPayload() {
      return buildFeedbackPayload(buildCurrentState());
    }

    // ── Per-question note wiring ────────────────────────────────────────────
    // Every .annotatable widget gets an always-visible free-text note field,
    // so the user can write something in alongside any structured answer.

    function setupAnnotatable(el) {
      // Derive anchor selector from data-anchor-id or element id
      var anchorId = el.getAttribute('data-anchor-id') || el.id;
      if (!anchorId) return; // Can't anchor — skip

      // Make sure element has the id for the selector to work
      if (!el.id) el.id = anchorId;

      var noteWrap = document.createElement('div');
      noteWrap.className = 'widget-note';

      var label = document.createElement('label');
      label.className = 'widget-note-label';
      label.setAttribute('for', 'note-' + anchorId);
      label.textContent = 'Add a note (optional)';

      var ta = document.createElement('textarea');
      ta.className = 'widget-note-input';
      ta.id = 'note-' + anchorId;
      ta.setAttribute('data-note-anchor', '#' + anchorId);
      ta.placeholder = 'Add a note or comment on this question…';

      noteWrap.appendChild(label);
      noteWrap.appendChild(ta);
      el.appendChild(noteWrap);
    }

    // Wire up all .annotatable elements
    document.querySelectorAll('.annotatable').forEach(setupAnnotatable);

    // ── Submit wiring ───────────────────────────────────────────────────────

    var submitBtn = document.getElementById('submit-btn');
    var copyBtn = document.getElementById('copy-btn');
    var submitError = document.getElementById('submit-error');
    var stateSubmitted = document.getElementById('state-submitted');
    var stateAlreadySubmitted = document.getElementById('state-already-submitted');
    var mainForm = document.getElementById('main-form');

    function setSubmitting(on) {
      if (submitBtn) submitBtn.disabled = on;
      if (submitBtn) submitBtn.textContent = on ? 'Submitting…' : 'Submit feedback';
    }

    function showError(msg) {
      if (submitError) {
        submitError.textContent = msg;
        submitError.style.display = 'block';
      }
    }

    function clearError() {
      if (submitError) {
        submitError.textContent = '';
        submitError.style.display = 'none';
      }
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        clearError();
        var payload = buildCurrentPayload();

        // No field is required to submit — the user may send feedback back
        // even with the verdict or any question left unanswered. Claude is
        // told (in the skill) to report which items were not answered.

        // Read CSRF token from server-injected global
        var token = (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '';

        setSubmitting(true);

        fetch('/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token,
          },
          body: JSON.stringify(payload),
        })
          .then(function (res) {
            if (res.status === 200) {
              if (mainForm) hide(mainForm);
              if (stateSubmitted) {
                stateSubmitted.style.display = 'block';
              }
            } else if (res.status === 410) {
              if (mainForm) hide(mainForm);
              if (stateAlreadySubmitted) {
                stateAlreadySubmitted.style.display = 'block';
              }
            } else {
              return res.json().then(function (body) {
                setSubmitting(false);
                showError('Submit failed (' + res.status + '): ' + (body.error || 'unknown error'));
              });
            }
          })
          .catch(function (err) {
            setSubmitting(false);
            showError(
              'Could not reach the server. Use "Copy feedback" to copy the JSON payload and paste it into Claude directly.'
            );
          });
      });
    }

    // ── Copy feedback fallback ──────────────────────────────────────────────
    // Copies the exact /submit JSON payload — same schema, no second format.

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var payload = buildCurrentPayload();
        var json = JSON.stringify(payload, null, 2);

        function markCopied() {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(function () {
            copyBtn.textContent = 'Copy feedback';
            copyBtn.classList.remove('copied');
          }, 2000);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json).then(markCopied).catch(function () {
            fallbackCopy(json, markCopied);
          });
        } else {
          fallbackCopy(json, markCopied);
        }
      });
    }

    function fallbackCopy(text, onSuccess) {
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

  }); // end DOMContentLoaded
} // end if (typeof document !== 'undefined')
