/**
 * app.js — browser-side interaction layer for the ask mode of the html-visualize workflow.
 *
 * Exports (UMD-compatible, testable in Node without a DOM):
 *   buildAskPayload(state) → { verdict, answers, comments, freeform }
 *
 * DOM wiring (only runs when document is available):
 *   - Collects answers from .widget[data-qid] elements.
 *   - Renders an always-visible free-text note field on each .annotatable widget.
 *   - Submits, copies and reports errors through the globals defined in
 *     /assets/shared/submit.js, which the page loads before this file:
 *     hvSubmit, hvCopy, hvShowError, hvClearError.
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
// Does NOT validate verdict enum — the radio markup constrains the values;
// the server is schema-agnostic and writes the payload verbatim.

function buildAskPayload(state) {
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
  module.exports = { buildAskPayload: buildAskPayload };
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
          // Per-column verdict stored as answers["<data-qid>-<data-approach-id>"]
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
      return buildAskPayload(buildCurrentState());
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

    // A page that forgot the /assets/shared/submit.js tag renders and accepts
    // answers normally, then throws on the first click and POSTs nothing —
    // leaving the blocking server waiting for a submit that can never arrive.
    // Report it at load, while the user can still copy their answers out by hand.
    if (typeof hvSubmit !== 'function' || typeof hvCopy !== 'function' ||
        typeof hvShowError !== 'function' || typeof hvClearError !== 'function') {
      var missingMsg = 'This page did not load /assets/shared/submit.js, so it cannot send ' +
        'anything back. Add <script src="/assets/shared/submit.js"></script> before ' +
        '<script src="/assets/ask/app.js"></script> and reload.';
      if (submitError) {
        submitError.textContent = missingMsg;
        submitError.style.display = 'block';
      }
      [submitBtn, copyBtn].forEach(function (btn) {
        if (btn) {
          btn.disabled = true;
          btn.title = missingMsg;
        }
      });
      return;
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        hvClearError(submitError);

        // No field is required to submit — the user may send feedback back
        // even with the verdict or any question left unanswered. Claude is
        // told (in the skill) to report which items were not answered.

        setSubmitting(true);

        hvSubmit(buildCurrentPayload(), {
          accepted: function () {
            if (mainForm) hide(mainForm);
            if (stateSubmitted) {
              stateSubmitted.style.display = 'block';
            }
          },
          alreadySubmitted: function () {
            if (mainForm) hide(mainForm);
            if (stateAlreadySubmitted) {
              stateAlreadySubmitted.style.display = 'block';
            }
          },
          failed: function (status, errorText) {
            setSubmitting(false);
            hvShowError(submitError, 'Submit failed (' + status + '): ' + errorText);
          },
          unreachable: function () {
            setSubmitting(false);
            hvShowError(
              submitError,
              'Could not reach the server. Use "Copy feedback" to copy the JSON payload and paste it into Claude directly.'
            );
          },
        });
      });
    }

    // ── Copy feedback fallback ──────────────────────────────────────────────
    // Copies the exact /submit JSON payload — same schema, no second format.

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        hvCopy(copyBtn, JSON.stringify(buildCurrentPayload(), null, 2));
      });
    }

  }); // end DOMContentLoaded
} // end if (typeof document !== 'undefined')
