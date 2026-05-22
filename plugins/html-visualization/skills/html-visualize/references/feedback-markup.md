# feedback-mode Markup Contract

Single source of truth for the HTML vocabulary Claude must use when authoring a
`feedback`-mode document. Claude can render any content using only the structure
and attributes defined here — without reading `style.css` or `app.js`.

## How it works

1. Claude renders the content as semantic HTML inside `#content`, based on
   `feedback-template.html` (also in this references directory).
2. Each commentable unit of content carries a unique `data-block-id`.
3. The file is served by `bin/server.js`, which injects a CSRF token and serves
   the skill's assets from `assets/feedback/`.
4. `assets/feedback/app.js` watches for text selections inside `#content`. When
   the user selects text, a floating 💬 button appears at the selection; clicking
   it opens a comment editor. The comment is anchored to the block and quotes the
   selected text. Comments render as inline cards after their block, and the
   quoted phrase is highlighted inline when the selection allows it.
5. The user ends each round with one of two buttons:
   - **Apply & preview** — submit with `action: "apply"`. Claude updates the
     document, regenerates this file, and re-serves it; the page auto-reloads.
   - **Submit & finish** — submit with `action: "submit"`. The final round.
6. Either button makes the server write a feedback file and exit, re-invoking
   Claude.

The `/submit` payload schema is defined in `feedback-submit-schema.md` (same directory).

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
  <meta name="fb-generation" content="[a fresh unique value per generation]">
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
      <div class="submit-row"> … #apply-btn, #submit-btn, #copy-btn … </div>
      <div id="submit-error" class="submit-error" style="display:none;"></div>
    </div>
    <div id="state-applying" class="state-applying"> … </div>
    <div id="state-submitted" class="state-submitted"> … </div>
    <div id="state-already-submitted" class="state-already-submitted"> … </div>
  </div>
  <script src="/assets/feedback/app.js"></script>
</body>
</html>
```

**Do NOT** add `<script>const CSRF_TOKEN = "...";</script>` manually — the server
injects it before `</head>`.

### The `fb-generation` meta

`<meta name="fb-generation" content="...">` carries a value that MUST be
**different every time Claude generates or regenerates the file** (e.g. the
output of `date +%s%N`). After an "Apply & preview" round, `app.js` polls the
re-served page and reloads as soon as it sees a `fb-generation` value different
from the one it loaded with. If the value is stale (reused), the page never
auto-reloads.

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
  **not** on individual `<li>` elements.
- Do not nest one `data-block-id` element inside another.

`app.js` inserts comment cards directly after a block, so blocks must be elements
that can have a `<div>` sibling (direct children of `#content` always qualify).

### How a comment is placed and anchored

- The user selects any run of text inside a block; a floating 💬 button appears
  at the selection. To comment on a whole block, the user selects all its text.
- The comment's anchor is the block's `data-block-id` — never a character offset.
- The exact selected text is captured verbatim as `quote`.
- If a selection spans more than one block, the comment anchors to the block
  where the selection started; `quote` is still the literal selected text.
- Each comment also carries `blockText` (the block's plain text) so Claude's
  read-back is self-contained.

---

## Required element IDs

These `id` values are hard-wired in `app.js` and must be present exactly once:

| id | Element | Purpose |
|---|---|---|
| `feedback-doc` | `<div>` wrapping content + freeform + actions | Hidden after a submit. |
| `content` | `<div>` wrapping the rendered content | Scanned for `[data-block-id]` blocks. |
| `comment-count` | `<span>` in the header | `app.js` writes a running comment count here. |
| `freeform-input` | The freeform `<textarea>` | Overall free-text feedback. |
| `apply-btn` | "Apply & preview" `<button>` | Sends `action: "apply"` — iterative round. |
| `submit-btn` | "Submit & finish" `<button>` | Sends `action: "submit"` — final round. |
| `copy-btn` | Copy-feedback `<button>` | Copies the `/submit` JSON payload. |
| `submit-error` | Error message `<div>` | Start hidden: `style="display:none"`. |
| `state-applying` | Post-Apply `<div>` | CSS hides it until shown; page auto-reloads from here. |
| `state-submitted` | Post-Submit success `<div>` | CSS hides it until shown. |
| `state-already-submitted` | Post-410 `<div>` | CSS hides it until shown. |

---

## Visual classes (do not rename)

`page-chrome`, `page-header`, `subtitle`, `comment-count`, `freeform-section`,
`submit-row`, `apply-btn`, `submit-btn`, `copy-btn`, `submit-error`,
`state-applying`, `state-submitted`, `state-already-submitted` — all defined in
`assets/feedback/style.css`. Use them exactly as in `template.html`.

The comment UI classes (`fb-float-btn`, `fb-comment-editor`, `fb-comment-card`,
`fb-quote`, `fb-highlight`, …) are injected by `app.js` at runtime. **Do not
author them.**

---

## Authoring checklist

Before finalising a feedback-mode document:

- [ ] `<meta name="fb-generation">` is present with a value different from any
      previous generation of this file.
- [ ] All content is inside `<div id="content">`, rendered as semantic HTML.
- [ ] Every commentable block is a direct child of `#content` with a unique
      `data-block-id` (printable ASCII, no whitespace).
- [ ] Lists carry `data-block-id` on the `<ul>`/`<ol>`, not on each `<li>`.
- [ ] `id="comment-count"` span is in the header.
- [ ] `id="freeform-input"` is on the freeform textarea.
- [ ] `id="feedback-doc"`, `id="content"`, `id="apply-btn"`, `id="submit-btn"`,
      `id="copy-btn"`, `id="submit-error"`, `id="state-applying"`,
      `id="state-submitted"`, `id="state-already-submitted"` are each present
      exactly once.
- [ ] `<link>` to `/assets/feedback/style.css` is in `<head>`; `<script>` for
      `/assets/feedback/app.js` is before `</body>`.
- [ ] No `<script>const CSRF_TOKEN = …</script>` block — the server injects it.
