# html-feedback Markup Contract

Single source of truth for the HTML vocabulary Claude must use when authoring an
`html-feedback` document. Claude can render any content using only the structure
and attributes defined here — without reading `style.css` or `app.js`.

## How it works

1. Claude renders the content as semantic HTML inside `#content`, based on
   `template.html` (also in this references directory).
2. Each commentable unit of content carries a unique `data-block-id`.
3. The file is served by `bin/server.js`, which injects a CSRF token and serves
   the skill's assets from `assets/feedback/`.
4. `assets/feedback/app.js` gives each block a 💬 button. The user clicks it to
   attach a comment; if they selected text inside the block first, that text is
   captured as a `quote`. Comments render as inline cards after their block.
5. On submit, the server writes a feedback file and exits — re-invoking Claude.

The `/submit` payload schema is defined in `submit-schema.md` (same directory).

---

## Page structure

Every document must have this top-level structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Review — [descriptive title]</title>
  <link rel="stylesheet" href="/assets/feedback/style.css">
</head>
<body>
  <div class="page-chrome">
    <header class="page-header">
      <h1>…</h1>
      <p class="subtitle">…</p>
      <span id="comment-count" class="comment-count"></span>
    </header>
    <div id="feedback-doc">
      <div id="content"> … commentable blocks … </div>
      <div class="freeform-section"> … #freeform-input … </div>
      <div class="submit-row"> … #submit-btn, #copy-btn … </div>
      <div id="submit-error" class="submit-error" style="display:none;"></div>
    </div>
    <div id="state-submitted" class="state-submitted"> … </div>
    <div id="state-already-submitted" class="state-already-submitted"> … </div>
  </div>
  <script src="/assets/feedback/app.js"></script>
</body>
</html>
```

**Do NOT** add `<script>const CSRF_TOKEN = "...";</script>` manually — the server
injects it before `</head>`.

---

## The content and its blocks

Render the content inside `<div id="content">` as ordinary semantic HTML —
headings, paragraphs, lists, tables, `<blockquote>`, `<pre><code>`. Style it to
read the way the content should read.

The `<h1>` in `.page-header` is the document's title. Start in-content headings
at `<h2>` — do not put a second `<h1>` inside `#content`.

A **block** is one commentable unit. Block rules:

- A block is a **direct child of `#content`** carrying a `data-block-id`.
- `data-block-id` is a non-empty string, printable ASCII (`0x20`–`0x7E`), no
  whitespace, unique within the document (e.g. `b-intro`, `b1`, `b-para-3`).
- Put one `data-block-id` per logical passage: each paragraph, each heading,
  each code block, each blockquote.
- A whole list is **one block** — put `data-block-id` on the `<ul>`/`<ol>`,
  **not** on individual `<li>` elements. Per-line precision still works: the
  user selects an item's text and it is captured as the comment's `quote`.
- Do not nest one `data-block-id` element inside another.

`app.js` injects a 💬 button into every block and inserts comment cards directly
after the block, so blocks must be elements that can have a `<div>` sibling
(direct children of `#content` always qualify).

### How a comment is anchored

- The comment's anchor is the block's `data-block-id` — never a character offset.
- If the user selected text inside the block before commenting, the exact
  selected text is captured verbatim as `quote`. If they selected nothing,
  `quote` is `""` and the comment applies to the whole block.
- If a selection spans more than one block, the comment anchors to the block
  whose 💬 button was clicked; `quote` is still the literal selected text.
- Each comment also carries `blockText` (the block's plain text) so Claude's
  read-back is self-contained.

---

## Required element IDs

These `id` values are hard-wired in `app.js` and must be present exactly once:

| id | Element | Purpose |
|---|---|---|
| `feedback-doc` | `<div>` wrapping content + freeform + submit | Hidden after a successful submit. |
| `content` | `<div>` wrapping the rendered content | Scanned for `[data-block-id]` blocks. |
| `comment-count` | `<span>` in the header | `app.js` writes a running comment count here. |
| `freeform-input` | The freeform `<textarea>` | Overall free-text feedback. |
| `submit-btn` | Submit `<button>` | Primary submit button. |
| `copy-btn` | Copy-feedback `<button>` | Copies the `/submit` JSON payload. |
| `submit-error` | Error message `<div>` | Start hidden: `style="display:none"`. |
| `state-submitted` | Post-submit success `<div>` | CSS hides it until shown. |
| `state-already-submitted` | Post-410 `<div>` | CSS hides it until shown. |

---

## Visual classes (do not rename)

`page-chrome`, `page-header`, `subtitle`, `comment-count`, `freeform-section`,
`submit-row`, `submit-btn`, `copy-btn`, `submit-error`, `state-submitted`,
`state-already-submitted` — all defined in `assets/feedback/style.css`. Use them
exactly as in `template.html`.

The comment UI classes (`block-comment-btn`, `fb-comment-editor`,
`fb-comment-card`, `fb-quote`, …) are injected by `app.js` at runtime. **Do not
author them.**

---

## Authoring checklist

Before finalising an html-feedback document:

- [ ] All content is inside `<div id="content">`, rendered as semantic HTML.
- [ ] Every commentable block is a direct child of `#content` with a unique
      `data-block-id` (printable ASCII, no whitespace).
- [ ] Lists carry `data-block-id` on the `<ul>`/`<ol>`, not on each `<li>`.
- [ ] `id="comment-count"` span is in the header.
- [ ] `id="freeform-input"` is on the freeform textarea.
- [ ] `id="feedback-doc"`, `id="content"`, `id="submit-btn"`, `id="copy-btn"`,
      `id="submit-error"`, `id="state-submitted"`, `id="state-already-submitted"`
      are each present exactly once.
- [ ] `<link>` to `/assets/feedback/style.css` is in `<head>`; `<script>` for
      `/assets/feedback/app.js` is before `</body>`.
- [ ] No `<script>const CSRF_TOKEN = …</script>` block — the server injects it.
