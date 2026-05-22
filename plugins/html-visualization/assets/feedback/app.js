/**
 * app.js — browser-side interaction layer for html-feedback.
 *
 * Exports (UMD-compatible, testable in Node without a DOM):
 *   buildFeedbackPayload(state) → { comments, freeform }
 *
 * DOM wiring (only runs when document is available):
 *   - Scans #content for [data-block-id] blocks and gives each a 💬 button.
 *   - Clicking 💬 opens an inline editor anchored to that block; if the user
 *     had selected text inside the block, the comment captures it as a quote.
 *   - Saved comments render as inline cards directly after their block.
 *   - Reads CSRF_TOKEN global injected by the server.
 *   - POSTs to /submit and handles 200 / 410 / other responses.
 *   - "Copy feedback" button copies the exact /submit JSON payload.
 *
 * Comment anchoring (full contract in markup.md):
 *   data-block-id — stable id on each commentable block of content
 *   A comment is { blockId, blockText, quote, text }:
 *     blockId   — the block the comment is anchored to
 *     blockText — the block's plain text (so read-back is self-contained)
 *     quote     — the exact text the user selected inside the block (may be "")
 *     text      — the user's comment
 */

'use strict';

// ── Pure payload builder ────────────────────────────────────────────────────
//
// state shape:
//   {
//     comments: [ { blockId, blockText, quote, text } ],
//     freeform: string
//   }
//
// Returns the exact /submit request body:
//   { comments, freeform }
//
// Enforces: comments with empty text — or no blockId — are filtered OUT.
// blockText and quote default to "" when absent.

function buildFeedbackPayload(state) {
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
    // commentState entries carry a client-side `id` for edit/delete; the id is
    // dropped from the submit payload by buildCurrentState().

    var commentState = [];        // [ { id, blockId, blockText, quote, text } ]
    var pendingSelection = null;  // { blockId, text } — last selection in a block
    var nextId = 1;
    var openEditor = null;        // the single open editor element, or null

    function newId() { return 'c' + (nextId++); }

    // ── Helpers ─────────────────────────────────────────────────────────────

    function show(el) { if (el) el.style.display = ''; }
    function hide(el) { if (el) el.style.display = 'none'; }

    function plainText(el) {
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
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

    // Cache each block's plain text BEFORE we inject any buttons, so blockText
    // never includes the 💬 control or comment cards.
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

    // ── Selection tracking ──────────────────────────────────────────────────
    // Remember the most recent non-empty selection that lies inside one block.
    // Clicking the 💬 button collapses the selection, so we keep the last
    // known value and consume it when an editor opens.

    document.addEventListener('selectionchange', function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      var text = sel.toString().replace(/\s+/g, ' ').trim();
      if (!text) return;
      var node = sel.getRangeAt(0).commonAncestorContainer;
      var node1 = node.nodeType === 1 ? node : node.parentElement;
      var block = node1 && node1.closest ? node1.closest('[data-block-id]') : null;
      if (block && content && content.contains(block)) {
        pendingSelection = { blockId: block.getAttribute('data-block-id'), text: text };
      }
    });

    // ── Wrap each block + add its comment button ────────────────────────────
    // Each block is wrapped in a positioned <div> so the 💬 button and the
    // comment cards are always valid children regardless of the block's tag
    // (a <button> or <div> cannot be a direct child of <ul>/<table>, but both
    // are fine inside the wrapper). The wrapper is created at runtime, so the
    // authored HTML stays clean.

    blocks.forEach(function (block) {
      var wrap = el('div', 'fb-block-wrap');
      if (block.parentNode) {
        block.parentNode.insertBefore(wrap, block);
        wrap.appendChild(block);
      }
      var btn = el('button', 'block-comment-btn', '💬');
      btn.type = 'button';
      btn.title = 'Comment on this';
      btn.setAttribute('aria-label', 'Comment on this block');
      // Suppress the default mousedown behaviour so clicking the button does
      // not collapse or alter the user's current text selection — that
      // selection is what becomes the comment's quote.
      btn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        openEditorForBlock(block.getAttribute('data-block-id'), null);
      });
      wrap.appendChild(btn);
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
          if (commentState[i].id === editingId) { existing = commentState[i]; }
        }
      }

      // Quote: editing keeps the original; a new comment consumes any pending
      // selection that belongs to this block.
      var quote = '';
      if (existing) {
        quote = existing.quote;
      } else if (pendingSelection && pendingSelection.blockId === blockId) {
        quote = pendingSelection.text;
      }
      pendingSelection = null;

      var editor = el('div', 'fb-comment-editor');

      if (quote) {
        editor.appendChild(el('div', 'fb-quote', '“' + quote + '”'));
      } else {
        editor.appendChild(el('div', 'fb-anchor-note',
          'Commenting on this block. Tip: select text first to quote it.'));
      }

      var ta = el('textarea', 'fb-comment-text');
      ta.placeholder = 'What should change here? e.g. “remove this paragraph”';
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
          commentState.push({
            id: newId(),
            blockId: blockId,
            blockText: blockTextById[blockId] || '',
            quote: quote,
            text: text,
          });
        }
        closeEditor();
        renderComments();
      });
      cancelBtn.addEventListener('click', closeEditor);

      block.insertAdjacentElement('afterend', editor);
      openEditor = editor;
      ta.focus();
    }

    // ── Render comment cards ────────────────────────────────────────────────

    function renderComments() {
      // Remove existing cards and clear block highlights.
      var oldCards = document.querySelectorAll('.fb-comment-card');
      Array.prototype.forEach.call(oldCards, function (c) {
        if (c.parentNode) c.parentNode.removeChild(c);
      });
      blocks.forEach(function (b) { b.classList.remove('has-comment'); });

      // Group comments by block, preserving insertion order.
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
          ref = card; // keep insertion order
        });
      });

      updateCommentCount();
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
        renderComments();
      });
      return card;
    }

    // ── Comment count indicator ─────────────────────────────────────────────

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

    function buildCurrentState() {
      return {
        comments: commentState.map(function (c) {
          return { blockId: c.blockId, blockText: c.blockText, quote: c.quote, text: c.text };
        }),
        freeform: freeformValue(),
      };
    }

    function buildCurrentPayload() {
      return buildFeedbackPayload(buildCurrentState());
    }

    // ── Submit wiring ───────────────────────────────────────────────────────

    var submitBtn = document.getElementById('submit-btn');
    var copyBtn = document.getElementById('copy-btn');
    var submitError = document.getElementById('submit-error');
    var stateSubmitted = document.getElementById('state-submitted');
    var stateAlreadySubmitted = document.getElementById('state-already-submitted');
    var feedbackDoc = document.getElementById('feedback-doc');

    function setSubmitting(on) {
      if (submitBtn) {
        submitBtn.disabled = on;
        submitBtn.textContent = on ? 'Submitting…' : 'Submit feedback';
      }
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
        closeEditor();
        var payload = buildCurrentPayload();

        // Nothing is required to submit — the user may send back zero comments
        // and empty freeform. The skill tells Claude how to interpret that.

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
              if (feedbackDoc) hide(feedbackDoc);
              if (stateSubmitted) stateSubmitted.style.display = 'block';
            } else if (res.status === 410) {
              if (feedbackDoc) hide(feedbackDoc);
              if (stateAlreadySubmitted) stateAlreadySubmitted.style.display = 'block';
            } else {
              return res.json().then(function (body) {
                setSubmitting(false);
                showError('Submit failed (' + res.status + '): ' + (body.error || 'unknown error'));
              });
            }
          })
          .catch(function () {
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
        closeEditor();
        var json = JSON.stringify(buildCurrentPayload(), null, 2);

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
