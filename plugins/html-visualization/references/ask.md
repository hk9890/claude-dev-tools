# ask mode

Convert a multi-question plan or decision batch into an interactive HTML feedback
document, serve it locally, wait for the user to submit via browser, then read
the feedback back and continue.

The shared serve procedure (pre-flight, temp dir, server startup, URL surfacing,
cleanup) lives in `references/serve.md` — Cycle A (blocking submit round-trip).
This file covers the ask-specific content authoring, read-back, and partial-submit
handling.

Every `references/<file>` named below sits **beside this file**, in
`<plugin root>/references/` — the directory this file was read from. Once
`$HTML_DIR` exists, `"$(cat "$HTML_DIR/.plugin-root")/references/<file>"` reaches
the same file.

---

## Scope of ask mode

The user asked for this surface — build the form. That holds whether they typed
the slash command or asked for a browser form in prose; either way the mode is
settled. Ask mode fits a batch of open questions or approve/reject decisions the
user answers in one pass, with a blocking submit round-trip.

Fall back to plain chat in only two cases:

- **Node.js is unavailable** — see pre-flight in `references/serve.md`.
- **The intent does not fit a form** — e.g. it is a single yes/no question, or it
  asks you to annotate existing content (that is feedback mode's shape). Say so
  briefly and handle the request in chat — do NOT silently switch to another
  mode; the user chooses the mode.

A couple of questions are still fine on a form the user asked for — do not refuse
on question count alone.

---

## Step 0 — Pre-flight

See `references/serve.md` — pre-flight section. Run `node --version`; if it
fails, ask questions in chat instead.

---

## Step 1 — Extract content from the conversation

Before writing a single line of HTML, decide what goes into the document.

**Every question is a briefing.** The reader was not in the conversation and will
not go looking: they open the page, read one question, and decide. So each one
carries what a briefing carries — plain language, the evidence attached, and a
recommendation at the end. A question the reader has to go research before
answering is a question you have not finished writing.

### What the document is made of

- **Page title and subtitle**: a short descriptive title and one sentence
  summarising what the user is reviewing. Write these now.
- **One widget per distinct question or decision**: each separately-numbered
  question or decision point becomes one widget. Do not collapse multiple
  questions into a single text widget — keep them separate so answers land in
  distinct `answers` keys.
- **Page-level context goes in prose**: material that orients the whole form —
  what was reviewed, what is already decided — goes in `<p>` blocks at the top
  of the form, not into widget labels.
- **Widget type per question** — the type is the shape of the answer, so match it
  to what the user is actually being asked to decide:
  - Open-ended question → `widget-text` (textarea)
  - Single-choice from a named list → `widget-radio`
  - "Select all that apply" → `widget-checkbox`
  - Approaches to compare side by side → `widget-approaches`, and pick its mode
    deliberately. Add `data-choice="single"` when the options are alternatives —
    the columns then share one radio group, so the answer is which one won, plus a
    `.approaches-none` where declining both is real. Leave `data-choice` off only
    when every combination is a genuine outcome, since that mode lets the user
    take all of them or none. Two alternatives evaluated independently come back
    as "approve both", which decides nothing.
- **Question IDs**: assign a short, stable, printable-ASCII slug (no whitespace)
  to each question — e.g. `q1`, `q-timeline`, `q-approach`. Record all IDs now;
  you will need them during read-back.

### How each question is briefed

- **Ask in plain language**: write the question so someone who has not read the
  conversation understands it. Expand a name the first time it appears —
  "`readTrustDocument`, the function that loads a project's trust file" — and
  spell out what a term means rather than assuming it is shared. Keep the
  question itself prose, with any identifier supporting it.
- **Bring the subject onto the page**: quote what is being decided — the code in
  a `<pre>`, the competing options in a table, the numbers that matter. Beside
  the quoted code, a `path:line` is a useful citation; on its own it is an
  errand.
- **Explain the background behind the question's why button**: where a question
  needs more than the one-line hint, put it in the panel — what happens today,
  why this is a question at all, and what changes with each answer. Depth stays
  one click away, so the page reads as a list of questions rather than an essay.
- **Draw it when the shape is the point**: what depends on what, what moves
  where, what happens in which order — a diagram settles these faster than a
  paragraph. Step 2c has the integration.
- **Recommend by marking the option**: on every question you can form a view on,
  put `.is-recommended` on the option you would pick, with the tradeoff that
  decided it behind its why button. The reader sees which one is advised without
  mapping a paragraph back onto the list. Leave every input unselected, so a
  submitted form always carries an answer the user actually gave. Where you
  genuinely have no basis to prefer one, say so in the question's why panel: a
  missing recommendation reads as an oversight rather than as neutrality.

---

## Step 2 — Build the HTML document

### 2a. Create temp directory

See `references/serve.md` — temp directory section. Use the prefix `html-ask`.

### 2b. Author the destination from the template

Read the template using its resolved absolute path (use the `.plugin-root` file
written in the temp-directory step):

```
Read: "$(cat "$HTML_DIR/.plugin-root")/references/ask-template.html"
```

Then author `$HTML_DIR/feedback.html` **with the Write tool**, directly at the
destination path — see `references/serve.md` — "Authoring files into the temp
directory".

The template contains example widgets — remove every example widget you do not
need. Keep the page structure, header, verdict section, freeform section, and
submit row exactly as in the template. Fill in the content per the markup
contract in
`"$(cat "$HTML_DIR/.plugin-root")/references/ask-markup.md"`. Key rules:

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
- The `/assets/ask/style.css` link and the `/assets/shared/submit.js` +
  `/assets/ask/app.js` scripts are correct as-is; do not change the paths or
  their order.

Consult `"$(cat "$HTML_DIR/.plugin-root")/references/ask-markup.md"`
for the full vocabulary (classes, data attributes, required IDs, verdict radio
values).

### 2c. Use HTML to make the content clear

Read and follow the guidelines binding every mode:

```
Read: "$(cat "$HTML_DIR/.plugin-root")/references/authoring.md"
```

Ask-specific: every visual exists to help the user *judge a question faster*, so
reach for —

- **Tables** to compare options, costs, or tradeoffs side by side.
- **Code blocks** (`<pre><code>`) for the snippets, config, or diffs under review.
- **Mermaid** when the answer turns on structure — dependencies, call flow,
  sequence, state. Read
  `"$(cat "$HTML_DIR/.plugin-root")/references/mermaid.md"`
  and add its module block once, before `</body>`.
- **Inline SVG** when a picture decides a question faster than a sentence and the
  shape is not a graph.

The why and recommendation panels, `<pre>`, `<table>` and the diagram containers
are all styled by `/assets/ask/style.css` and `/assets/shared/overlay.css`
already — author the markup from `ask-markup.md` and add no CSS for them. Author
styling for anything genuinely new inline or in a `<style>` block in `<head>` —
never edit the served stylesheets under `/assets/`, which the other modes render
from too.

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

> Your feedback form is ready → **[Open feedback form](http://HOST:PORT/)**
>
> Click that link, answer the questions, and click "Submit feedback". I will
> continue as soon as you submit. Anyone who can reach this port can open the
> form, so mind the network you are on.

**If the user says the link does not open**, do not wait out the timeout — Cycle A
blocks for 1800 s and then exits 2, which is the worst place to discover a dead
URL. See "When the printed hostname does not resolve" in `references/serve.md`:
offer `http://localhost:PORT/` on the same port when they are on an SSH tunnel,
and otherwise kill the server and ask the questions in chat.

---

## Step 4 — Read back the feedback

When the harness re-invokes Claude after server exit, read:

```
FEEDBACK_FILE  (the path you computed in Step 2d)
```

If `FEEDBACK_FILE` is missing or the server exited non-zero, the round-trip timed
out — recover as in serve.md Cycle A (tell the user; offer to re-serve or take the
answers in chat).

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

Full schema: `"$(cat "$HTML_DIR/.plugin-root")/references/ask-submit-schema.md"`.

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
