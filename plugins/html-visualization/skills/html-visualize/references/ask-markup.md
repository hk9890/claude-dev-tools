# ask-mode Markup Contract

This document is the single source of truth for the HTML vocabulary Claude must use when authoring an `ask`-mode document. Claude can author any number of question widgets using only the classes and attributes defined here — without reading `style.css` or `app.js`.

## How it works

1. Claude writes a complete HTML file based on `ask-template.html` (also in this references directory).
2. The file is served by `bin/server.js`, which injects a CSRF token and serves the skill's assets from `assets/ask/` and `assets/shared/`.
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
  <script src="/assets/shared/submit.js"></script>
  <script src="/assets/shared/overlay.js"></script>
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

### Explanation and recommendation

Both are shown through the shared overlay primitive — a button that opens a
panel — so they cost no vertical space until the reader asks for them. The
panels are plain `[popover]` elements: the browser gives Escape, click-outside
dismissal and focus handling, and no JavaScript is involved.

Reading order inside a `.widget` is: label (carrying the why button) → hint →
evidence (code, table, diagram) → the input, with the recommended option marked
in place.

| Class | Element | Purpose |
|---|---|---|
| `.hv-info-btn` | `<button>` with `popovertarget` | The small round opener. Put one inside `.widget-label` for "why this matters", and one inside `.recommended-mark` for "why this option". Always give it an `aria-label`. |
| `.hv-popover` | `<div popover>` | The panel. Lead with an `<h3>` naming what it answers, then prose. Place it as a sibling of the widget; `id` must match the opener's `popovertarget`. |
| `.hv-popover-close` | `<button>` inside the panel | Closes it — `popovertarget` set to the panel's `id`, `popovertargetaction="hide"`. |
| `.is-recommended` | A `.radio-option`, `.checkbox-option`, or `.approach-col` | Tints that option green. Marking is not selecting: leave every input unchecked. |
| `.recommended-mark` | `<span>` inside the recommended option | Wraps the "Recommended" pill and its why button. |
| `.hv-pill` | `<span>` inside `.recommended-mark` | The pill itself; text is "Recommended". |
| `.widget-recommendation` | `<div>` | Only for a question with no options to mark — an open-ended `.widget-text`. Carries `.widget-recommendation-label`, the recommendation, and a `.recommendation-why` paragraph. |

A question has at most one `.is-recommended` option. Where the recommendation is
"leave it as is", that must be an option in the list so it can be the one marked.

### Diagram classes

Available in ask mode exactly as in visualize mode; the integration is documented in `mermaid.md` (same directory).

| Class | Element | Purpose |
|---|---|---|
| `.vis-mermaid-wrap` | `<div>` wrapping one `<pre class="mermaid">` | Diagram surface; scrolls horizontally rather than overflowing the widget. |
| `.vis-mermaid-label` | `<span>` inside it | Caption above a diagram, e.g. **Before** / **After**. |
| `.vis-compare` | `<div>` wrapping two `.vis-mermaid-wrap` | Two-column grid for a before/after pair; stacks below 580px. |
| `.hv-zoom-btn` | `<button>` inside `.vis-mermaid-wrap` | "Expand" — opens the diagram at viewport size. Every diagram gets one; `mermaid.md` has the markup. |
| `.hv-popover-wide` | `<div popover>` with an empty `.hv-popover-body` | The zoom panel. `overlay.js` clones the rendered diagram into the body on open. |

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
The widget has **two modes**, and picking the wrong one produces answers that are not decisions.

| Mode | `data-choice` | The question it asks | Answer |
|---|---|---|---|
| **Single** — the default choice for a comparison | `"single"` | "Which of these?" The columns share one radio group, so exactly one wins or none does. | `answers["<qid>"]` = the winning `data-approach-id`, or `null` |
| **Independent** | omitted | "For each of these separately, yes or no?" Each column carries its own verdict. Only correct when every combination is a real outcome — all of them, none of them, any subset. | `answers["<qid>-<approach-id>"]` per column |

Two mutually exclusive options in independent mode let the user approve both and reject both, neither of which answers the question. When in doubt, use single.

| Class | Element | Purpose |
|---|---|---|
| `.approaches-grid` | `<div>` inside `.widget-approaches` | CSS grid that lays out the columns (2-column, collapses on mobile). |
| `.approach-col` | `<div>` for one column | One approach; **must** carry `data-approach-id`. |
| `.approach-header` | `<div>` inside `.approach-col` | Column heading (approach name). |
| `.approach-choice` | `<label>` inside `.approach-col` | **Single mode.** The column's radio — `name` is the widget's `data-qid`, `value` is the column's `data-approach-id`. |
| `.approaches-none` | `<label>` after `.approaches-grid` | **Single mode.** "Neither" — same `name`, its own `value` (e.g. `"neither"`). Include it whenever declining both is a real answer, so it is distinguishable from a question the user never reached. |
| `.approach-verdict` | `<div>` inside `.approach-col` | **Independent mode.** Per-column approve/reject radio pair, `name="<qid>-<approach-id>"`. |

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

**Single mode** (`data-choice="single"`) — one key for the whole widget. Every radio in the widget, including `.approaches-none`, shares `name="<data-qid>"`:

```html
<div class="widget widget-approaches annotatable" data-qid="q-approach"
     data-qtype="approaches" data-choice="single"
     data-anchor-id="q-approach" id="q-approach">
  <span class="widget-label">Which approach?</span>
  <div class="approaches-grid">
    <div class="approach-col" data-approach-id="a">
      <div class="approach-header">Approach A</div>
      <p>What it does, and what it costs.</p>
      <label class="approach-choice">
        <input type="radio" name="q-approach" value="a"> Pick this one
      </label>
    </div>
    <div class="approach-col" data-approach-id="b">
      <div class="approach-header">Approach B</div>
      <p>What it does, and what it costs.</p>
      <label class="approach-choice">
        <input type="radio" name="q-approach" value="b"> Pick this one
      </label>
    </div>
  </div>
  <label class="approaches-none">
    <input type="radio" name="q-approach" value="neither"> Neither — leave it as it is
  </label>
</div>
```

→ `answers["q-approach"]` is `"a"`, `"b"`, `"neither"`, or `null` if unanswered.

**Independent mode** (no `data-choice`) — one key per column:

- A column with `data-approach-id="a"` → answer key `"q-approach-a"`
- A column with `data-approach-id="b"` → answer key `"q-approach-b"`

The per-column radio group `name` must match the answer key: `name="q-approach-a"`.
Per-column radio values must be `"approve"` or `"reject"`.

These answers live in `answers`, not in `verdict`. The overall `verdict` is always the page-level `.widget-verdict` selection.

---

## Authoring checklist

Before finalising an ask-mode document:

- [ ] Every `.widget` has a unique `data-qid` (printable ASCII, no whitespace).
- [ ] Every `.widget` has a `data-qtype` matching its input type.
- [ ] Every question is answerable from the page alone — the thing being decided is quoted, drawn, or explained on it.
- [ ] Every question with options marks one `.is-recommended`, or genuinely has no basis for a recommendation and says so in a panel.
- [ ] Every `.widget-approaches` whose options are mutually exclusive carries `data-choice="single"`, with one shared radio group and a `.approaches-none` where declining both is real.
- [ ] Every `popovertarget` names a `[popover]` element that exists on the page, and no two panels share an `id`.
- [ ] No input is pre-checked — including the recommended one.
- [ ] Every `<pre class="mermaid">` sits inside a `.vis-mermaid-wrap` with a `.hv-zoom-btn`, and the page carries the module block from `mermaid.md` once.
- [ ] Every `radio` / `checkbox` / `approaches` widget has `.annotatable` and a `data-anchor-id` equal to its `data-qid`, so it gets an always-visible note field.
- [ ] `.widget-text` widgets are NOT `.annotatable` (the textarea is already free text).
- [ ] Every `.approach-col` has `data-approach-id`; the radio `name` matches `<data-qid>-<data-approach-id>`.
- [ ] The verdict section contains all three radio options with the exact values above.
- [ ] `id="freeform-input"` is on the freeform textarea.
- [ ] `id="submit-btn"`, `id="copy-btn"`, `id="submit-error"`, `id="main-form"`, `id="state-submitted"`, `id="state-already-submitted"` are all present once.
- [ ] `<link>` to `/assets/ask/style.css` is in `<head>`; `<script>` for `/assets/shared/submit.js`, `/assets/shared/overlay.js` and then `/assets/ask/app.js` — in that order — are before `</body>`.
- [ ] No `<script>const CSRF_TOKEN = …</script>` block — the server injects this.
