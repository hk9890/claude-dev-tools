/**
 * app.js — browser-side interaction layer for html-feedback.
 *
 * Exports (UMD-compatible, testable in Node without a DOM):
 *   buildFeedbackPayload(state) → { action, comments, freeform }
 *
 * DOM wiring (only runs when document is available):
 *   - Selecting text inside #content reveals a floating 💬 button at the
 *     selection; clicking it opens a comment editor anchored to that text.
 *   - Saved comments render as inline cards after their block; the selected
 *     phrase is highlighted inline when the selection allows it.
 *   - "Apply & preview" sends the feedback with action "apply": the server
 *     exits, Claude updates the document and re-serves, and this page polls
 *     for the new generation and reloads itself.
 *   - "Submit & finish" sends action "submit" — the final round.
 *   - Reads CSRF_TOKEN global injected by the server.
 *
 * Comment anchoring (full contract in markup.md):
 *   data-block-id — stable id on each commentable block of content
 *   A comment is { blockId, blockText, quote, text }:
 *     blockId   — the block the comment is anchored to
 *     blockText — the block's plain text (so read-back is self-contained)
 *     quote     — the exact text the user selected inside the block
 *     text      — the user's comment
 */

'use strict';

// ── Pure payload builder ────────────────────────────────────────────────────
//
// state shape:
//   {
//     action:   "apply" | "submit",
//     comments: [ { blockId, blockText, quote, text } ],
//     freeform: string
//   }
//
// Returns the exact /submit request body: { action, comments, freeform }.
//
// Enforces: action defaults to "submit" for any non-"apply" value; comments
// with empty text — or no blockId — are filtered OUT; blockText and quote
// default to "" when absent.

function buildFeedbackPayload(state) {
  var action = state.action === 'apply' ? 'apply' : 'submit';
  var freeform = state.freeform == null ? '' : String(state.freeform);

  var rawComments = Array.isArray(state.comments) ? state.comments : [];
  var comments = [];
  for (var i = 0; i < rawComments.length; i++) {
    var c = rawComments[i];
    if (!c || typeof c.text !== 'string' || c.text.length === 0) continue;
    if (typeof c.blockId !== 'string' || c.blockId.length === 0) continue;
    comments.push({
      blockId: c.blockId,
      blockText: typeof c.blockText === 'string' ? c.blockText : '',
      quote: typeof c.quote === 'string' ? c.quote : '',
      text: c.text,
    });
  }

  return {
    action: action,
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

    // ── State ───────────────────────────────────────────────────────────────

    var commentState = [];        // [ { id, blockId, blockText, quote, text } ]
    var pendingSelection = null;  // { blockId, text, range } — last text selection
    var nextId = 1;
    var openEditor = null;        // the single open editor element, or null

    function newId() { return 'c' + (nextId++); }

    // ── Helpers ─────────────────────────────────────────────────────────────

    function show(el) { if (el) el.style.display = ''; }
    function hide(el) { if (el) el.style.display = 'none'; }

    function plainText(node) {
      var t = (node.textContent || '').replace(/\s+/g, ' ').trim();
      return t.length > 2000 ? t.slice(0, 2000) + '…' : t;
    }

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    // ── Discover commentable blocks ─────────────────────────────────────────

    var content = document.getElementById('content');
    var blocks = content
      ? Array.prototype.slice.call(content.querySelectorAll('[data-block-id]'))
      : [];

    // Cache each block's plain text BEFORE any highlight <mark> is inserted, so
    // blockText is always the pristine content.
    var blockTextById = {};
    blocks.forEach(function (block) {
      var id = block.getAttribute('data-block-id');
      if (id) blockTextById[id] = plainText(block);
    });

    function blockById(id) {
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].getAttribute('data-block-id') === id) return blocks[i];
      }
      return null;
    }

    // ── Generation marker (for the auto-reload poll) ────────────────────────

    var genMeta = document.querySelector('meta[name="fb-generation"]');
    var myGeneration = genMeta ? genMeta.getAttribute('content') || '' : '';

    // ── Floating comment button driven by text selection ────────────────────

    var floatBtn = el('button', 'fb-float-btn', '💬 Comment');
    floatBtn.type = 'button';
    floatBtn.style.display = 'none';
    document.body.appendChild(floatBtn);

    // mousedown.preventDefault keeps the current selection intact on click.
    floatBtn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    floatBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (pendingSelection) {
        openEditorForBlock(pendingSelection.blockId, null);
      }
      hide(floatBtn);
    });

    function blockOf(node) {
      var e = node && node.nodeType === 1 ? node : node && node.parentElement;
      return e && e.closest ? e.closest('[data-block-id]') : null;
    }

    function refreshFloatingButton() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        hide(floatBtn);
        pendingSelection = null;
        return;
      }
      var text = sel.toString().replace(/\s+/g, ' ').trim();
      var range = sel.getRangeAt(0);
      var startBlock = blockOf(range.startContainer);
      if (!text || !startBlock || !content || !content.contains(startBlock)) {
        hide(floatBtn);
        pendingSelection = null;
        return;
      }
      pendingSelection = {
        blockId: startBlock.getAttribute('data-block-id'),
        text: text,
        range: range.cloneRange(),
      };
      // Show first, then position — a positioning hiccup must never stop the
      // button from appearing.
      floatBtn.style.display = 'block';
      try {
        var rect = range.getBoundingClientRect();
        floatBtn.style.top = (rect.top + window.scrollY - floatBtn.offsetHeight - 6) + 'px';
        floatBtn.style.left = (rect.right + window.scrollX - floatBtn.offsetWidth) + 'px';
      } catch (e) {
        // Leave the button at its default position.
      }
    }

    // Recompute after the selection settles (mouse drag or keyboard select).
    document.addEventListener('mouseup', function () { setTimeout(refreshFloatingButton, 10); });
    document.addEventListener('keyup', function (ev) {
      if (ev.shiftKey || ev.key === 'Shift') setTimeout(refreshFloatingButton, 10);
    });

    // ── Editor ──────────────────────────────────────────────────────────────

    function closeEditor() {
      if (openEditor && openEditor.parentNode) {
        openEditor.parentNode.removeChild(openEditor);
      }
      openEditor = null;
    }

    // editingId === null → adding a new comment; otherwise editing that comment.
    function openEditorForBlock(blockId, editingId) {
      closeEditor();
      var block = blockById(blockId);
      if (!block) return;

      var existing = null;
      if (editingId) {
        for (var i = 0; i < commentState.length; i++) {
          if (commentState[i].id === editingId) existing = commentState[i];
        }
      }

      // Quote + range: editing keeps the original quote (no re-highlight); a new
      // comment consumes the pending selection that belongs to this block.
      var quote = '';
      var range = null;
      if (existing) {
        quote = existing.quote;
      } else if (pendingSelection && pendingSelection.blockId === blockId) {
        quote = pendingSelection.text;
        range = pendingSelection.range;
      }
      pendingSelection = null;

      var editor = el('div', 'fb-comment-editor');
      if (quote) {
        editor.appendChild(el('div', 'fb-quote', '“' + quote + '”'));
      } else {
        editor.appendChild(el('div', 'fb-anchor-note',
          'Commenting on this whole block.'));
      }

      var ta = el('textarea', 'fb-comment-text');
      ta.placeholder = 'What should change here? e.g. “remove this sentence”';
      if (existing) ta.value = existing.text;
      editor.appendChild(ta);

      var actions = el('div', 'fb-editor-actions');
      var saveBtn = el('button', 'fb-save', existing ? 'Update comment' : 'Save comment');
      saveBtn.type = 'button';
      var cancelBtn = el('button', 'fb-cancel', 'Cancel');
      cancelBtn.type = 'button';
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
      editor.appendChild(actions);

      saveBtn.addEventListener('click', function () {
        var text = ta.value.trim();
        if (!text) { closeEditor(); return; }
        if (existing) {
          existing.text = text;
        } else {
          var comment = {
            id: newId(),
            blockId: blockId,
            blockText: blockTextById[blockId] || '',
            quote: quote,
            text: text,
          };
          commentState.push(comment);
          highlightComment(comment, range);
        }
        closeEditor();
        renderComments();
      });
      cancelBtn.addEventListener('click', closeEditor);

      block.insertAdjacentElement('afterend', editor);
      openEditor = editor;
      ta.focus();
    }

    // ── Inline highlight of the quoted phrase (best effort) ─────────────────
    // surroundContents throws when the selection crosses element boundaries;
    // in that case the comment is still saved, just without the inline mark.

    function highlightComment(comment, range) {
      if (!range || !comment.quote) return;
      try {
        var mark = el('mark', 'fb-highlight');
        mark.setAttribute('data-comment-id', comment.id);
        range.surroundContents(mark);
      } catch (e) {
        // Multi-element selection — skip the inline mark; the card still shows
        // the quote, so the comment is not lost.
      }
    }

    function unwrapHighlight(commentId) {
      var mark = document.querySelector('mark.fb-highlight[data-comment-id="' + commentId + '"]');
      if (!mark || !mark.parentNode) return;
      var parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      if (parent.normalize) parent.normalize();
    }

    // ── Render comment cards ────────────────────────────────────────────────

    function renderComments() {
      var oldCards = document.querySelectorAll('.fb-comment-card');
      Array.prototype.forEach.call(oldCards, function (c) {
        if (c.parentNode) c.parentNode.removeChild(c);
      });
      blocks.forEach(function (b) { b.classList.remove('has-comment'); });

      var byBlock = {};
      var order = [];
      commentState.forEach(function (c) {
        if (!byBlock[c.blockId]) { byBlock[c.blockId] = []; order.push(c.blockId); }
        byBlock[c.blockId].push(c);
      });

      order.forEach(function (blockId) {
        var block = blockById(blockId);
        if (!block) return;
        block.classList.add('has-comment');
        var ref = block;
        byBlock[blockId].forEach(function (c) {
          var card = buildCard(c);
          ref.insertAdjacentElement('afterend', card);
          ref = card;
        });
      });

      updateCommentCount();
      updateActionButtons();
    }

    function buildCard(comment) {
      var card = el('div', 'fb-comment-card');
      card.setAttribute('data-comment-id', comment.id);

      if (comment.quote) {
        card.appendChild(el('div', 'fb-quote', '“' + comment.quote + '”'));
      }
      card.appendChild(el('div', 'fb-comment-body', comment.text));

      var actions = el('div', 'fb-card-actions');
      var editBtn = el('button', 'fb-edit', 'Edit');
      editBtn.type = 'button';
      var delBtn = el('button', 'fb-delete', 'Delete');
      delBtn.type = 'button';
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);

      editBtn.addEventListener('click', function () {
        openEditorForBlock(comment.blockId, comment.id);
      });
      delBtn.addEventListener('click', function () {
        commentState = commentState.filter(function (c) { return c.id !== comment.id; });
        unwrapHighlight(comment.id);
        renderComments();
      });
      return card;
    }

    // ── Header indicators ───────────────────────────────────────────────────

    var countEl = document.getElementById('comment-count');
    function updateCommentCount() {
      if (!countEl) return;
      var n = commentState.length;
      countEl.textContent = n === 0
        ? 'No comments yet'
        : n + (n === 1 ? ' comment' : ' comments');
    }
    updateCommentCount();

    // ── Build current state and payload ─────────────────────────────────────

    function freeformValue() {
      var ta = document.getElementById('freeform-input');
      return ta ? ta.value : '';
    }

    function buildCurrentState(action) {
      return {
        action: action,
        comments: commentState.map(function (c) {
          return { blockId: c.blockId, blockText: c.blockText, quote: c.quote, text: c.text };
        }),
        freeform: freeformValue(),
      };
    }

    function hasContent() {
      return commentState.length > 0 || freeformValue().trim().length > 0;
    }

    // ── Submit / Apply wiring ───────────────────────────────────────────────

    var applyBtn = document.getElementById('apply-btn');
    var submitBtn = document.getElementById('submit-btn');
    var copyBtn = document.getElementById('copy-btn');
    var submitError = document.getElementById('submit-error');
    var stateSubmitted = document.getElementById('state-submitted');
    var stateApplying = document.getElementById('state-applying');
    var stateAlreadySubmitted = document.getElementById('state-already-submitted');
    var feedbackDoc = document.getElementById('feedback-doc');

    function updateActionButtons() {
      // Apply with nothing to apply is a no-op round-trip — disable it then.
      if (applyBtn) applyBtn.disabled = !hasContent();
    }
    updateActionButtons();

    var freeformEl = document.getElementById('freeform-input');
    if (freeformEl) freeformEl.addEventListener('input', updateActionButtons);

    function setBusy(on, label) {
      if (applyBtn) applyBtn.disabled = on || !hasContent();
      if (submitBtn) submitBtn.disabled = on;
      if (on && label && submitBtn) submitBtn.textContent = label;
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

    function sendFeedback(action) {
      clearError();
      closeEditor();
      hide(floatBtn);
      var payload = buildFeedbackPayload(buildCurrentState(action));
      var token = (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '';
      setBusy(true, action === 'apply' ? 'Working…' : 'Submitting…');

      fetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (res.status === 200) {
            if (feedbackDoc) hide(feedbackDoc);
            if (action === 'apply') {
              if (stateApplying) stateApplying.style.display = 'block';
              startReloadPolling();
            } else {
              if (stateSubmitted) stateSubmitted.style.display = 'block';
            }
          } else if (res.status === 410) {
            if (feedbackDoc) hide(feedbackDoc);
            if (stateAlreadySubmitted) stateAlreadySubmitted.style.display = 'block';
          } else {
            return res.json().then(function (body) {
              setBusy(false);
              showError('Request failed (' + res.status + '): ' + (body.error || 'unknown error'));
            });
          }
        })
        .catch(function () {
          setBusy(false);
          showError(
            'Could not reach the server. Use "Copy feedback" to copy the JSON payload and paste it into Claude directly.'
          );
        });
    }

    if (applyBtn) applyBtn.addEventListener('click', function () { sendFeedback('apply'); });
    if (submitBtn) submitBtn.addEventListener('click', function () { sendFeedback('submit'); });

    // ── Auto-reload after Apply ─────────────────────────────────────────────
    // Poll GET / until the served page reports a different fb-generation than
    // ours — that is the regenerated document — then reload. Capped so a
    // crashed or port-changed re-serve cannot poll forever.

    function startReloadPolling() {
      var attempts = 0;
      var maxAttempts = 60;
      var timer = setInterval(function () {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(timer);
          if (stateApplying) {
            var p = stateApplying.querySelector('p');
            if (p) p.textContent =
              'This is taking longer than expected. Reload this page manually once Claude reports the update is ready.';
          }
          return;
        }
        var ctrl = new AbortController();
        var to = setTimeout(function () { ctrl.abort(); }, 800);
        fetch('/', { signal: ctrl.signal, cache: 'no-store' })
          .then(function (res) { return res.text(); })
          .then(function (txt) {
            clearTimeout(to);
            var m = txt.match(/name="fb-generation"\s+content="([^"]*)"/);
            if (m && m[1] && m[1] !== myGeneration) {
              clearInterval(timer);
              window.location.reload();
            }
          })
          .catch(function () { clearTimeout(to); });
      }, 1000);
    }

    // ── Copy feedback fallback ──────────────────────────────────────────────
    // Copies the exact /submit JSON payload for a final submit.

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        closeEditor();
        var json = JSON.stringify(buildFeedbackPayload(buildCurrentState('submit')), null, 2);

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
