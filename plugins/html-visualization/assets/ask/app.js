/**
 * app.js — browser-side interaction layer for the ask mode of the html-visualize workflow.
 *
 * Exports (UMD-compatible, testable in Node without a DOM):
 *   buildAskPayload(state) → { verdict, answers, comments, freeform }
 *
 * DOM wiring (only runs when document is available):
 *   - Collects answers from .widget[data-qid] elements.
 *   - Numbers each question and tags it with its type (.widget-index).
 *   - Puts a keycap on every option and BINDS it: 1–9 pick an option in the
 *     question you are looking at, ? opens its "why this matters" panel, and
 *     Cmd/Ctrl+Enter submits. A painted keycap that does nothing is worse than
 *     no keycap, so every cap the page draws is wired here.
 *   - Builds the left rail: one entry per question, a filled dot once it is
 *     answered, and a progress line — a long form used to give no sense of
 *     where you were or how much was left.
 *   - Renders an always-visible free-text answer field on each .annotatable widget.
 *   - Submits, copies and reports errors through the globals defined in
 *     /assets/shared/submit.js, which the page loads before this file:
 *     hvSubmit, hvCopy, hvShowError, hvClearError.
 *   - "Copy feedback" button copies the exact /submit JSON payload.
 *
 * Widget vocabulary (full contract in markup.md):
 *   data-qid       — question ID; non-empty, printable ASCII, no whitespace
 *   data-qtype     — text | radio | checkbox | approaches
 *   data-anchor-id — base value used as CSS selector anchor (#<value>)
 *   .annotatable   — widget that gets an always-visible free-text answer field
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

    function hide(el) {
      if (el) el.style.display = 'none';
    }

    function el(tag, cls, text) {
      var node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text != null) node.textContent = text;
      return node;
    }

    function list(root, sel) {
      return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    // Label text without the "?" of an info button folded into it.
    function plainLabel(node) {
      if (!node) return '';
      var clone = node.cloneNode(true);
      list(clone, 'button, .recommended-mark, .hv-pill').forEach(function (b) { b.remove(); });
      return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function truncate(text, max) {
      return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
    }

    // Cmd on Apple hardware, Ctrl everywhere else. Getting this backwards makes
    // the status line advertise a chord that does nothing on the user's machine.
    var IS_APPLE = (function () {
      var p = (navigator.userAgentData && navigator.userAgentData.platform) ||
              navigator.platform || '';
      return /mac|iphone|ipad|ipod/i.test(p);
    }());
    var MOD_LABEL = IS_APPLE ? '⌘' : 'Ctrl';

    function isModifierHeld(e) {
      return IS_APPLE ? e.metaKey : e.ctrlKey;
    }

    function isTyping(target) {
      if (!target) return false;
      var tag = (target.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' ||
             target.isContentEditable === true;
    }

    var widgets = list(document, '.widget[data-qid]');
    var verdictSection = document.querySelector('.verdict-section');

    // ── Read answers from widgets ───────────────────────────────────────────

    function collectAnswers() {
      var answers = {};
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

        } else if (qtype === 'approaches' && widget.getAttribute('data-choice') === 'single') {
          // Mutually exclusive comparison: the columns share ONE radio group, so the
          // answer is which approach won — or null for "neither / not answered".
          // Without this mode a two-option either/or lets the user approve both and
          // reject both, neither of which is a decision.
          var picked = widget.querySelector('input[type="radio"]:checked');
          answers[qid] = picked ? picked.value : null;

        } else if (qtype === 'approaches') {
          // Independent evaluation: each column carries its own verdict, stored as
          // answers["<data-qid>-<data-approach-id>"]. Use this only when the options
          // genuinely can all be taken, all be refused, or any subset.
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
      var out = [];
      list(document, 'textarea.widget-note-input[data-note-anchor]').forEach(function (ta) {
        var text = ta.value.trim();
        if (text.length > 0) {
          out.push({ anchor: ta.getAttribute('data-note-anchor'), text: text });
        }
      });
      return out;
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
    // Every .annotatable widget gets an always-visible free-text field. It is
    // labelled as an answer, not as a note: the options never cover every case,
    // and a user who writes their real answer here must not read the field as
    // an optional afterthought to a pick they did not want to make.

    function setupAnnotatable(node) {
      // Derive anchor selector from data-anchor-id or element id
      var anchorId = node.getAttribute('data-anchor-id') || node.id;
      if (!anchorId) return; // Can't anchor — skip

      // Make sure element has the id for the selector to work
      if (!node.id) node.id = anchorId;

      var noteWrap = el('div', 'widget-note');

      var label = el('label', 'widget-note-label', 'Answer in your own words');
      label.setAttribute('for', 'note-' + anchorId);

      var ta = el('textarea', 'widget-note-input');
      ta.id = 'note-' + anchorId;
      ta.setAttribute('data-note-anchor', '#' + anchorId);
      ta.placeholder = 'Write your own answer here, or add a note on this question…';

      noteWrap.appendChild(label);
      noteWrap.appendChild(ta);
      node.appendChild(noteWrap);
    }

    list(document, '.annotatable').forEach(setupAnnotatable);

    // ── Question index line ─────────────────────────────────────────────────
    // Numbering is generated, never authored: a hand-written "03" goes stale the
    // moment a question is inserted above it, and nothing would catch that.

    var KIND_LABEL = {
      text: 'Written answer',
      radio: 'Single choice',
      checkbox: 'Multi select',
      approaches: 'Compare',
    };

    function kindLabel(widget) {
      var qtype = widget.getAttribute('data-qtype') || 'text';
      if (qtype === 'approaches') {
        return widget.getAttribute('data-choice') === 'single' ? 'Compare · pick one' : 'Compare · rate each';
      }
      return KIND_LABEL[qtype] || 'Question';
    }

    function pad2(n) {
      return n < 10 ? '0' + n : String(n);
    }

    widgets.forEach(function (widget, i) {
      if (!widget.id) widget.id = 'hv-q' + (i + 1);
      if (widget.querySelector('.widget-index')) return;
      var line = el('div', 'widget-index');
      line.appendChild(el('span', 'widget-num', pad2(i + 1)));
      line.appendChild(el('span', 'widget-kind', kindLabel(widget)));
      widget.insertBefore(line, widget.firstChild);
    });

    // ── Keycaps on options ──────────────────────────────────────────────────
    // The cap is prepended as a real child of the row, so the CSS grid can put
    // it in its own column and the "Recommended" pill can be pulled out of the
    // label text into a column of its own — at content width the pill trailing
    // the sentence left a wide dead band on the right.

    function optionRows(widget) {
      if (!widget) return [];
      return list(widget, '.radio-option, .checkbox-option, .approaches-none, .approach-choice');
    }

    function keyFor(index) {
      return index < 9 ? String(index + 1) : null;
    }

    widgets.forEach(function (widget) {
      optionRows(widget).forEach(function (row, i) {
        var mark = row.querySelector('.recommended-mark');
        if (mark && mark.parentNode !== row) row.appendChild(mark);

        // .approach-choice sits inside a column that already reads as one unit;
        // a cap there would compete with the column's own heading.
        if (row.classList.contains('approach-choice')) return;

        var key = keyFor(i);
        if (!key || row.querySelector(':scope > .hv-key')) return;
        var cap = el('span', 'hv-key', key);
        cap.setAttribute('aria-hidden', 'true');
        row.insertBefore(cap, row.firstChild);
      });
    });

    // ── Rail ────────────────────────────────────────────────────────────────

    var railEntries = [];
    var railList = document.querySelector('.hv-rail-list');
    var railFill = document.querySelector('.hv-rail-fill');
    var railCount = document.querySelector('.hv-rail-count');

    function addRailEntry(target, num, labelText, counts) {
      if (!railList) return;
      var item = el('button', 'hv-rail-item');
      item.type = 'button';
      item.appendChild(el('span', 'hv-rail-num', num));
      item.appendChild(el('span', 'hv-rail-label', labelText));
      item.appendChild(el('span', 'hv-rail-dot'));
      item.addEventListener('click', function () {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      railList.appendChild(item);
      railEntries.push({ target: target, item: item, counts: counts });
    }

    if (railList) {
      widgets.forEach(function (widget, i) {
        var text = plainLabel(widget.querySelector('.widget-label')) || 'Question ' + (i + 1);
        addRailEntry(widget, pad2(i + 1), truncate(text, 42), true);
      });
      if (verdictSection) {
        addRailEntry(verdictSection, '—', 'Verdict', false);
      }
    }

    // ── Answered state ──────────────────────────────────────────────────────

    function hasNote(node) {
      var ta = node.querySelector('.widget-note-input');
      return !!(ta && ta.value.trim().length > 0);
    }

    function isAnswered(node) {
      if (node === verdictSection) {
        return !!node.querySelector('input[type="radio"]:checked');
      }
      var qtype = node.getAttribute('data-qtype') || 'text';
      if (qtype === 'text') {
        var ta = node.querySelector('textarea');
        if (ta && ta.value.trim().length > 0) return true;
      } else if (qtype === 'checkbox') {
        if (node.querySelector('input[type="checkbox"]:checked')) return true;
      } else if (qtype === 'approaches' && node.getAttribute('data-choice') !== 'single') {
        var cols = list(node, '.approach-col[data-approach-id]');
        if (cols.length > 0 && cols.every(function (c) {
          return !!c.querySelector('input[type="radio"]:checked');
        })) return true;
      } else if (node.querySelector('input[type="radio"]:checked')) {
        return true;
      }
      return hasNote(node);
    }

    function refreshProgress() {
      var done = 0;
      var total = 0;
      railEntries.forEach(function (entry) {
        var answered = isAnswered(entry.target);
        entry.item.classList.toggle('is-answered', answered);
        if (entry.counts) {
          total += 1;
          if (answered) done += 1;
        }
      });
      if (railFill) railFill.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
      if (railCount) {
        railCount.textContent = total
          ? done + ' of ' + total + ' answered'
          : 'Nothing to answer';
      }
    }

    document.addEventListener('input', refreshProgress);
    document.addEventListener('change', refreshProgress);
    refreshProgress();

    // ── Which question am I in ──────────────────────────────────────────────
    // Drives the rail highlight and tells the digit keys which question to act
    // on. Focus wins over scroll position — if the caret is in a question, that
    // is the one the user means.

    var currentTarget = railEntries.length ? railEntries[0].target : null;

    function markCurrent(target) {
      if (!target) return;
      currentTarget = target;
      railEntries.forEach(function (entry) {
        entry.item.classList.toggle('is-current', entry.target === target);
      });
    }

    // An IntersectionObserver was the obvious tool here and it got this wrong:
    // asked for "the first entry currently visible", it keeps naming the
    // question ABOVE the one you scrolled to, because that one is still
    // fractionally in view. The digit keys then act on the wrong question and
    // appear dead. A scroll anchor is deterministic: the current question is
    // the LAST one whose top has passed the anchor line.
    // "The question with the most of itself on screen", topmost on a tie. A
    // last-one-past-an-anchor-line rule reads the wrong question whenever one
    // is centred rather than scrolled to the top.
    var TOPBAR = 90;

    function pickCurrent() {
      if (!railEntries.length) return;
      var vh = window.innerHeight;
      var best = null;
      var bestVisible = -Infinity;
      for (var i = 0; i < railEntries.length; i++) {
        var r = railEntries[i].target.getBoundingClientRect();
        var visible = Math.min(r.bottom, vh) - Math.max(r.top, TOPBAR);
        if (visible > bestVisible) {
          bestVisible = visible;
          best = railEntries[i].target;
        }
      }
      if (best) markCurrent(best);
    }

    if (railEntries.length) {
      markCurrent(railEntries[0].target);

      // Focus wins over scroll position: if the caret is in a question, that is
      // the one the user means, wherever the viewport happens to be.
      document.addEventListener('focusin', function (e) {
        for (var i = 0; i < railEntries.length; i++) {
          if (railEntries[i].target.contains(e.target)) {
            markCurrent(railEntries[i].target);
            return;
          }
        }
      });

      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          pickCurrent();
        });
      }, { passive: true });

      window.addEventListener('resize', pickCurrent);
      pickCurrent();
    }

    // ── Keyboard ────────────────────────────────────────────────────────────

    var submitBtn = document.getElementById('submit-btn');
    var copyBtn = document.getElementById('copy-btn');
    var submitError = document.getElementById('submit-error');
    var stateSubmitted = document.getElementById('state-submitted');
    var stateAlreadySubmitted = document.getElementById('state-already-submitted');
    var mainForm = document.getElementById('main-form');

    document.addEventListener('keydown', function (e) {
      if (e.altKey) return;

      // Submit is the one chord that must work from inside a textarea — it is
      // the last thing you do, and you are usually typing when you decide to.
      if (isModifierHeld(e) && e.key === 'Enter') {
        if (submitBtn && !submitBtn.disabled) {
          e.preventDefault();
          submitBtn.click();
        }
        return;
      }

      if (isTyping(e.target) || e.ctrlKey || e.metaKey) return;
      if (document.querySelector('.hv-popover:popover-open')) return;

      if (e.key === '?') {
        var opener = currentTarget && currentTarget.querySelector('.hv-info-btn');
        if (opener) {
          e.preventDefault();
          opener.click();
        }
        return;
      }

      if (e.key >= '1' && e.key <= '9') {
        var rows = optionRows(currentTarget === verdictSection ? verdictSection : currentTarget);
        if (currentTarget === verdictSection) {
          rows = list(verdictSection, '.verdict-option');
        }
        var row = rows[Number(e.key) - 1];
        if (!row) return;
        var input = row.querySelector('input');
        if (!input) return;
        e.preventDefault();
        input.checked = input.type === 'checkbox' ? !input.checked : true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // ── Status hint ─────────────────────────────────────────────────────────

    // The host is a fact the page can read; a hand-written one goes stale the
    // first time the port moves. Empty on file:// — a saved copy has no host.
    var topbarMeta = document.querySelector('.hv-topbar-meta');
    if (topbarMeta && !topbarMeta.textContent.trim()) {
      topbarMeta.textContent = location.host || '';
    }

    var statusHint = document.querySelector('.hv-status-hint');
    if (statusHint) {
      statusHint.textContent = '1–9 select · ? why · ' + MOD_LABEL + '↵ submit';
    }

    list(document, '[data-hv-mod]').forEach(function (node) {
      node.textContent = MOD_LABEL + '↵';
    });

    // ── Submit wiring ───────────────────────────────────────────────────────

    function setSubmitting(on) {
      if (!submitBtn) return;
      submitBtn.disabled = on;
      var label = submitBtn.querySelector('.hv-btn-label');
      if (label) label.textContent = on ? 'Submitting…' : 'Submit feedback';
      else submitBtn.textContent = on ? 'Submitting…' : 'Submit feedback';
    }

    function finish(panel) {
      if (mainForm) hide(mainForm);
      document.body.classList.add('hv-submitted');
      if (panel) panel.style.display = 'block';
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
            finish(stateSubmitted);
          },
          alreadySubmitted: function () {
            finish(stateAlreadySubmitted);
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

    // ── Liveness heartbeat ──────────────────────────────────────────────────
    // Proves to the server that this page is still open, and tells the page as
    // soon as the server is not. Without it, an ask form left open past the
    // server's life looks completely normal until Submit is pressed and fails —
    // after the answers have been filled in.

    if (typeof hvHeartbeat === 'function') {
      hvHeartbeat({
        controls: function () { return [submitBtn]; },
        // The same JSON the Copy feedback button produces, so a stranded answer
        // set pastes into Claude in the one format the skill already reads.
        collectWork: function () {
          try {
            return JSON.stringify(buildCurrentPayload(), null, 2);
          } catch (e) {
            return '';
          }
        },
      });
    }

  }); // end DOMContentLoaded
} // end if (typeof document !== 'undefined')
