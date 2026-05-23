# ask mode

Convert a multi-question plan or decision batch into an interactive HTML feedback
document, serve it locally, wait for the user to submit via browser, then read
the feedback back and continue.

The shared serve procedure (pre-flight, temp dir, server startup, URL surfacing,
cleanup) lives in `references/serve.md` — Cycle A (blocking submit round-trip).
This file covers the ask-specific content authoring, read-back, and partial-submit
handling.

---

## Scope of ask mode

The user invoked ask mode explicitly — build the form. Ask mode fits a batch of
open questions or approve/reject decisions the user answers in one pass, with a
blocking submit round-trip.

Fall back to plain chat in only two cases:

- **Node.js is unavailable** — see pre-flight in `references/serve.md`.
- **The intent does not fit a form** — e.g. it is a single yes/no question, or it
  asks you to annotate existing content (that is feedback mode). Say so briefly,
  then handle it the right way instead of building a form nobody needs.

A couple of questions are still fine on a form the user asked for — do not refuse
on question count alone.

---

## Step 0 — Pre-flight

See `references/serve.md` — pre-flight section. Run `node --version`; if it
fails, ask questions in chat instead.

---

## Step 1 — Extract content from the conversation

Before writing a single line of HTML, decide what goes into the document:

- **Page title and subtitle**: a short descriptive title and one sentence
  summarising what the user is reviewing. Write these now.
- **One widget per distinct question or decision**: each separately-numbered
  question or decision point becomes one widget. Do not collapse multiple
  questions into a single text widget — keep them separate so answers land in
  distinct `answers` keys.
- **Context belongs in prose, not widgets**: background information, summaries,
  and rationale go into `<p>` blocks inside the form, not into widget labels.
- **Widget type per question**:
  - Open-ended question → `widget-text` (textarea)
  - Single-choice from a named list → `widget-radio`
  - "Select all that apply" → `widget-checkbox`
  - Two or more approaches to compare and choose between → `widget-approaches`
- **Question IDs**: assign a short, stable, printable-ASCII slug (no whitespace)
  to each question — e.g. `q1`, `q-timeline`, `q-approach`. Record all IDs now;
  you will need them during read-back.

---

## Step 2 — Build the HTML document

### 2a. Create temp directory

See `references/serve.md` — temp directory section. Use the prefix `html-ask`.

### 2b. Author the destination from the template

Read `${CLAUDE_PLUGIN_ROOT}/skills/html-visualize/references/ask-template.html`
with the Read tool, then author `$HTML_DIR/feedback.html` with the Write tool
using the template as your starting structure. Do NOT `cp` the template then
`Edit` the copy — the harness rejects it as "File has not been read yet". If
you do `cp`, you MUST Read the copied file before any Edit.

The template contains example widgets — remove every example widget you do not
need. Keep the page structure, header, verdict section, freeform section, and
submit row exactly as in the template. Fill in the content per the markup
contract in
`${CLAUDE_PLUGIN_ROOT}/skills/html-visualize/references/ask-markup.md`. Key rules:

- Replace `[Claude: replace with document title]` in `<h1>` and `<title>` with
  your page title.
- Replace `[Claude: replace with a one-sentence description...]` in `.subtitle`
  with your subtitle.
- Add one widget `<div>` per question inside `<div id="main-form">`, before the
  verdict section.
- Every widget `<div>` must have `data-qid` (your question slug), `data-qtype`
  (`text`|`radio`|`checkbox`|`approaches`), and `class="widget widget-<type>"`.
- Add `annotatable` and `data-anchor-id="<qid>"` to every `radio`/`checkbox`/
  `approaches` widget — this gives that question an always-visible free-text note
  field. Do NOT add it to `text` widgets; their `<textarea>` is already the
  free-text field.
- Do NOT add `<script>const CSRF_TOKEN = "...";</script>` — the server injects it.
- The `/assets/ask/style.css` link and `/assets/ask/app.js` script are correct
  as-is; do not change the paths.

Consult `${CLAUDE_PLUGIN_ROOT}/skills/html-visualize/references/ask-markup.md`
for the full vocabulary (classes, data attributes, required IDs, verdict radio
values).

### 2c. Use HTML to make the content clear

Follow the **Authoring guidelines — all modes** in the `html-visualize` `SKILL.md`
(already loaded). Ask-specific: every visual exists to help the user *judge a
question faster*, so reach for —

- **Tables** to compare options, costs, or tradeoffs side by side.
- **Code blocks** (`<pre><code>`) for snippets, file paths, or diffs under review.
- **Inline SVG** when a picture decides a question faster than a sentence.

Author extra styling inline or in a `<style>` block in `<head>` — never edit the
shared `/assets/ask/style.css`.

### 2d. Compute and record the feedback file path

```
FEEDBACK_FILE="$HTML_DIR/feedback.feedback.json"
```

The server derives this as `<html-file-dir>/<basename-without-ext>.feedback.json`.
Since the HTML file is `$HTML_DIR/feedback.html`, the feedback file will be
`$HTML_DIR/feedback.feedback.json`. Do not glob for it later — use this exact path.

---

## Step 3 — Start the server

See `references/serve.md` — Cycle A (blocking submit round-trip). Surface the URL
to the user as a markdown link with the message:

> Your feedback form is ready → **[Open feedback form](http://127.0.0.1:PORT/)**
>
> Click that link, answer the questions, and click "Submit feedback". I will
> continue as soon as you submit.

---

## Step 4 — Read back the feedback

When the harness re-invokes Claude after server exit, read:

```
FEEDBACK_FILE  (the path you computed in Step 2d)
```

The file contains:

```json
{
  "submittedAt": "<ISO-8601 timestamp>",
  "verdict":    "approve" | "approve-with-changes" | "reject",
  "answers":    { "<qID>": <value> },
  "comments":   [ { "anchor": "#<qid>", "text": "<string>" } ],
  "freeform":   "<string>"
}
```

Full schema: `${CLAUDE_PLUGIN_ROOT}/skills/html-visualize/references/ask-submit-schema.md`.

How to interpret each field:

| Field | How to use it |
|---|---|
| `verdict` | Overall user decision. `approve` → proceed as planned. `approve-with-changes` → incorporate feedback then proceed. `reject` → rethink; discuss alternatives. `""` (empty) → no verdict given; do not assume approval (see below). |
| `answers` | Map from `data-qid` slug to answer value. Text → string. Radio → selected value string, or `null` if unanswered. Checkbox → array of selected values (may be `[]`). Approaches column → per-column key `<qid>-<approach-id>` with value `"approve"`, `"reject"`, or `null` if unanswered. |
| `comments` | Per-question free-text notes. Each has `anchor` (`#<qid>`) and `text`. Treat as the user's free-text answer or comment for that specific question. |
| `freeform` | Free-text field. May be empty string. If non-empty, treat as general feedback. |

After reading the feedback, continue the original task:

- If `verdict` is `approve`: proceed.
- If `verdict` is `approve-with-changes`: acknowledge each piece of feedback
  explicitly, then proceed with the changes incorporated.
- If `verdict` is `reject`: summarise the rejection reason from freeform/comments
  and open a discussion about the path forward.
- If `verdict` is empty (`""`): the user submitted without choosing a verdict. Do
  NOT treat this as approval. Use whatever answers, notes, and freeform were
  provided, and ask for the missing verdict before proceeding on anything that
  depends on it.

### Partial submissions

The user can submit at any time, even with questions left unanswered — the form
never forces a complete response. An unanswered question shows up as an empty
string (text), `null` (radio), `[]` (checkbox), or `null` for an approaches
column. When you continue, do NOT silently guess at missing answers: explicitly
tell the user which questions you are treating as unanswered, listing them by
their question text, and ask any follow-up you genuinely need in chat.

---

## Step 5 — Clean up

See `references/serve.md` — cleanup section (ask mode). Delete `$HTML_DIR` once
you have read the feedback file and extracted everything you need from it.
