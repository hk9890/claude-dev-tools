# ask-mode Markup Contract

This document is the single source of truth for the HTML vocabulary Claude must use when authoring an `ask`-mode document. Claude can author any number of question widgets using only the classes and attributes defined here — without reading `style.css` or `app.js`.

## How it works

1. Claude writes a complete HTML file based on `ask-template.html` (also in this references directory).
2. The file is served by `bin/server.js`, which injects a CSRF token and serves the skill's assets from `assets/ask/`.
3. `assets/ask/app.js` reads the widget DOM and assembles the `/submit` payload.
4. On submit, the server writes a feedback file and exits — re-invoking Claude.

The `/submit` payload schema is defined in `ask-submit-schema.md` (same directory). The markup contract here describes only what Claude needs to author HTML correctly.

---

## Page structure

Every document must have this top-level structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feedback — [descriptive title]</title>
  <link rel="stylesheet" href="/assets/ask/style.css">
</head>
<body>
  <div class="page-chrome">
    <header class="page-header"> … </header>
    <div id="main-form"> … (widgets, verdict, freeform, submit-row) </div>
    <div id="state-submitted" class="state-submitted"> … </div>
    <div id="state-already-submitted" class="state-already-submitted"> … </div>
  </div>
  <script src="/assets/ask/app.js"></script>
</body>
</html>
```

**Do NOT** add `<script>const CSRF_TOKEN = "...";</script>` manually — the server injects it before `</head>`.

---

## Classes

### Layout classes

| Class | Element | Purpose |
|---|---|---|
| `.page-chrome` | `<div>` | Outer max-width container; always wraps everything inside `<body>`. |
| `.page-header` | `<header>` | Top header area; contains `<h1>` (title) and `.subtitle` paragraph. |
| `.subtitle` | `<p>` inside `.page-header` | One-line description of the document. |
| `.verdict-section` | `<div>` | Wraps the overall `.widget-verdict` and its `<h2>` heading. |
| `.freeform-section` | `<div>` | Wraps the global free-text textarea and its `<h2>` heading. |
| `.submit-row` | `<div>` | Wraps `.submit-btn` and `.copy-btn`; always placed after `.freeform-section`. |

### Widget classes (add to the same element)

| Class | Used with | Purpose |
|---|---|---|
| `.widget` | Any question widget `<div>` | Base widget card. Always paired with a type-specific class. |
| `.widget-text` | `.widget` | Free-text question with a `<textarea>`. |
| `.widget-radio` | `.widget` | Single-choice question with radio buttons. |
| `.widget-checkbox` | `.widget` | Multi-choice question with checkboxes. |
| `.widget-approaches` | `.widget` | Side-by-side approach comparison (two columns). |
| `.widget-verdict` | `<div>` inside `.verdict-section` | Overall verdict radio group. NOT a `data-qid` widget. |
| `.widget-label` | `<span>` or `<label>` | Question label; displayed in bold above the input. |
| `.widget-hint` | `<span>` | Supplementary hint text below the label. Optional. |

### Option list classes

| Class | Element | Parent widget type |
|---|---|---|
| `.radio-options` | `<div>` wrapping radio options | `.widget-radio` |
| `.radio-option` | `<label>` for one radio option (contains `<input type="radio">` + `<span>` for text — do NOT nest a second `<label>`) | `.radio-options` |
| `.checkbox-options` | `<div>` wrapping checkbox options | `.widget-checkbox` |
| `.checkbox-option` | `<label>` for one checkbox option (contains `<input type="checkbox">` + `<span>` for text — do NOT nest a second `<label>`) | `.checkbox-options` |

### Verdict widget classes

| Class | Element | Purpose |
|---|---|---|
| `.verdict-options` | `<div>` inside `.widget-verdict` | Container for the three verdict options. |
| `.verdict-option` | `<label>` for one verdict radio | One row in the verdict selector. |
| `.verdict-approve` | `.verdict-option` | Marks the "approve" option (green highlight). |
| `.verdict-approve-with-changes` | `.verdict-option` | Marks the "approve with changes" option (amber highlight). |
| `.verdict-reject` | `.verdict-option` | Marks the "reject" option (red highlight). |
| `.verdict-label` | `<div>` inside `.verdict-option` | Wraps `<strong>` label and `<span>` description. |

### Approaches widget classes

| Class | Element | Purpose |
|---|---|---|
| `.approaches-grid` | `<div>` inside `.widget-approaches` | CSS grid that lays out the columns (2-column, collapses on mobile). |
| `.approach-col` | `<div>` for one column | One approach; **must** carry `data-approach-id`. |
| `.approach-header` | `<div>` inside `.approach-col` | Column heading (approach name). |
| `.approach-verdict` | `<div>` inside `.approach-col` | Per-column approve/reject radio pair. |

### Per-question note classes

Every widget carrying `.annotatable` gets an **always-visible** free-text note field, injected by `app.js`. This guarantees the user can always write something in on a question, alongside its structured answer. Each non-empty note becomes one entry in the `comments` array of the submit payload, with `anchor` set to `#<data-anchor-id>`.

| Class | Element | Purpose |
|---|---|---|
| `.annotatable` | A choice-style `.widget` (`radio` / `checkbox` / `approaches`) | Marks the widget to receive an always-visible note field. Do NOT add it to `.widget-text` — that widget's `<textarea>` already *is* the free-text field. |
| `.widget-note` | `<div>` (injected by `app.js`) | Wraps the note label and textarea. Do NOT author manually. |
| `.widget-note-label` | `<label>` (injected by `app.js`) | Label shown above the note textarea. Do NOT author manually. |
| `.widget-note-input` | `<textarea>` (injected by `app.js`) | The free-text note field. Do NOT author manually. |

### Submit / state classes

| Class | Element | Purpose |
|---|---|---|
| `.submit-btn` | `<button id="submit-btn">` | Primary submit button. `id` is required. |
| `.copy-btn` | `<button id="copy-btn">` | Copies the `/submit` JSON payload to clipboard. `id` is required. |
| `.copied` | `.copy-btn` (added by `app.js`) | Briefly shown after successful copy. Do NOT author manually. |
| `.submit-error` | `<div id="submit-error">` | Displays submit error messages. `id` is required. Start hidden: `style="display:none"`. |
| `.state-submitted` | `<div id="state-submitted">` | Shown after a successful submit (200). Start hidden (no inline style needed — CSS hides it). |
| `.state-already-submitted` | `<div id="state-already-submitted">` | Shown after a 410 duplicate-submit response. |

---

## `data-*` attributes

| Attribute | Element | Required | Purpose |
|---|---|---|---|
| `data-qid` | `.widget` | Yes (for Q&A widgets) | Question ID: non-empty string, printable ASCII only (`0x20`–`0x7E`), no whitespace. Must be unique within the document. Used as the key in the `answers` map. |
| `data-qtype` | `.widget` | Yes | Widget type: `text` \| `radio` \| `checkbox` \| `approaches`. Tells `app.js` how to collect the answer. |
| `data-anchor-id` | `.annotatable` | Yes (for annotatable widgets) | Identifies the widget's note. The widget's element `id` AND the note's `anchor` in the payload `comments` array will both be `#<value>`. Must be a valid HTML `id` token — set it equal to the widget's `data-qid`. |
| `data-approach-id` | `.approach-col` | Yes | Short identifier for one column in a `.widget-approaches` widget (e.g. `"a"`, `"b"`, `"option-1"`). Combined with the parent `data-qid` to form the answer key: `<data-qid>-<data-approach-id>`. |

---

## Required element IDs

These `id` values are hard-wired in `app.js` and must be present exactly as shown:

| id | Element | Required |
|---|---|---|
| `main-form` | `<div>` wrapping all widgets | Yes |
| `submit-btn` | Submit `<button>` | Yes |
| `copy-btn` | Copy-feedback `<button>` | Yes |
| `submit-error` | Error message `<div>` | Yes |
| `freeform-input` | The freeform `<textarea>` | Yes |
| `state-submitted` | Post-submit success `<div>` | Yes |
| `state-already-submitted` | Post-410 `<div>` | Yes |

---

## Verdict radio values

The three verdict radio buttons **must** use exactly these `value` attributes (case-sensitive):

| `value` | Label to show user |
|---|---|
| `approve` | Approve |
| `approve-with-changes` | Approve with changes |
| `reject` | Reject |

All three radios must share `name="verdict"`.

The verdict is **optional**: if the user submits without selecting one, the payload carries `verdict: ""` and the server accepts it. The server is schema-agnostic and does not validate verdict values — the radio markup above is what constrains them to these three.

---

## Approaches widget — answer key convention

For an `.widget-approaches` widget with `data-qid="q-approach"`:

- A column with `data-approach-id="a"` → answer key `"q-approach-a"`
- A column with `data-approach-id="b"` → answer key `"q-approach-b"`

The per-column radio group `name` must match the answer key: `name="q-approach-a"`.
Per-column radio values must be `"approve"` or `"reject"`.

These per-column answers live in `answers`, not in `verdict`. The overall `verdict` is always the page-level `.widget-verdict` selection.

---

## Authoring checklist

Before finalising an ask-mode document:

- [ ] Every `.widget` has a unique `data-qid` (printable ASCII, no whitespace).
- [ ] Every `.widget` has a `data-qtype` matching its input type.
- [ ] Every `radio` / `checkbox` / `approaches` widget has `.annotatable` and a `data-anchor-id` equal to its `data-qid`, so it gets an always-visible note field.
- [ ] `.widget-text` widgets are NOT `.annotatable` (the textarea is already free text).
- [ ] Every `.approach-col` has `data-approach-id`; the radio `name` matches `<data-qid>-<data-approach-id>`.
- [ ] The verdict section contains all three radio options with the exact values above.
- [ ] `id="freeform-input"` is on the freeform textarea.
- [ ] `id="submit-btn"`, `id="copy-btn"`, `id="submit-error"`, `id="main-form"`, `id="state-submitted"`, `id="state-already-submitted"` are all present once.
- [ ] `<link>` to `/assets/ask/style.css` is in `<head>`; `<script>` for `/assets/ask/app.js` is before `</body>`.
- [ ] No `<script>const CSRF_TOKEN = …</script>` block — the server injects this.
