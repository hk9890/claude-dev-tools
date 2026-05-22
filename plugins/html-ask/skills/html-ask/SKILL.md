---
name: html-ask
description: "This skill should be used when Claude is about to present a multi-section plan, a batch of decisions, or a set of open questions to the user AND the count crosses the trigger bar: 3 or more separately-numbered open questions, OR 3 or more approve/reject decision points, OR the user explicitly requests an HTML feedback form. Triggers on phrases like 'I have several questions before proceeding', 'here is my plan — please review each section', 'let me present the options for your approval', 'can you send me an HTML form for this'. Does not apply when there are 2 or fewer questions, when a single yes/no answer is sufficient, when the user wants a fast in-chat back-and-forth, or when the content is a short factual answer. When unsure, bias toward NOT triggering — ask in chat instead."
---

## What this skill does

Convert a multi-question plan or decision batch into an interactive HTML feedback document, serve it locally, wait for the user to submit via browser, then read the feedback back and continue.

---

## Trigger bar

**Use html-ask when ANY of the following is true:**

1. Claude has 3 or more separately-numbered open questions it needs answered before proceeding.
2. The response would contain 3 or more approve/reject decision points (e.g., "should I use X?", "do you want option A or B?").
3. The user explicitly asks for an HTML feedback form.

**Do NOT use html-ask when:**

- There are 2 or fewer questions — ask them in chat.
- A single yes/no or short answer is sufficient.
- The user wants fast in-chat iteration (e.g., "quickly tell me which option").
- The questions are purely rhetorical or are already answered by context.
- Node.js is not available (see pre-flight below).

**When unsure, bias toward NOT triggering — ask in chat instead.**

---

## Step 0 — Pre-flight: check Node.js

Before writing any file or surfacing any URL, run:

```bash
node --version
```

If the command fails (Node is absent or not on PATH), do NOT build the HTML document. Instead:
- Ask the questions in chat, as plain text.
- Tell the user: "Node.js is not available on this system, so I cannot serve the interactive feedback form. I'll ask my questions here instead."

Only proceed to Step 1 when `node --version` succeeds.

---

## Step 1 — Extract content from the conversation

Before writing a single line of HTML, decide what goes into the document:

- **Page title and subtitle**: a short descriptive title and one sentence summarising what the user is reviewing. Write these now.
- **One widget per distinct question or decision**: each separately-numbered question or decision point becomes one widget. Do not collapse multiple questions into a single text widget — keep them separate so answers land in distinct `answers` keys.
- **Context belongs in prose, not widgets**: background information, summaries, and rationale go into `<p>` blocks inside the form, not into widget labels.
- **Widget type per question**:
  - Open-ended question → `widget-text` (textarea)
  - Single-choice from a named list → `widget-radio`
  - "Select all that apply" → `widget-checkbox`
  - Two or more approaches to compare and choose between → `widget-approaches`
- **Question IDs**: assign a short, stable, printable-ASCII slug (no whitespace) to each question — e.g. `q1`, `q-timeline`, `q-approach`. Record all IDs now; you will need them during read-back.

---

## Step 2 — Build the HTML document

### 2a. Create a unique per-invocation temp directory

```bash
TMPDIR_BASE=$(node -e "process.stdout.write(require('os').tmpdir())")
HTML_DIR="$TMPDIR_BASE/html-ask-$(date +%s)-$$"
mkdir -p "$HTML_DIR"
```

The directory must be unique per invocation. Never reuse a directory from a previous invocation.

### 2b. Copy the template

Copy `${CLAUDE_PLUGIN_ROOT}/skills/html-ask/references/template.html` into `$HTML_DIR/feedback.html`.

The template contains example widgets — remove every example widget you do not need. Keep the page structure, header, verdict section, freeform section, and submit row exactly as in the template.

### 2c. Fill in the content

Edit the copied file per the markup contract in `${CLAUDE_PLUGIN_ROOT}/skills/html-ask/references/markup.md`. Key rules to follow while authoring:

- Replace `[Claude: replace with document title]` in `<h1>` and `<title>` with your page title.
- Replace `[Claude: replace with a one-sentence description...]` in `.subtitle` with your subtitle.
- Add one widget `<div>` per question inside `<div id="main-form">`, before the verdict section.
- Every widget `<div>` must have `data-qid` (your question slug), `data-qtype` (`text`|`radio`|`checkbox`|`approaches`), and `class="widget widget-<type>"`.
- Add `annotatable` and `data-anchor-id="<qid>"` to every `radio`/`checkbox`/`approaches` widget — this gives that question an always-visible free-text note field, so the user can always write something in. Do NOT add it to `text` widgets; their `<textarea>` is already the free-text field.
- Do NOT add `<script>const CSRF_TOKEN = "...";</script>` — the server injects it.
- The `/assets/style.css` link and `/assets/app.js` script are correct as-is; do not change the paths.

Consult `${CLAUDE_PLUGIN_ROOT}/skills/html-ask/references/markup.md` for the full vocabulary (classes, data attributes, required IDs, verdict radio values).

### 2d. Compute and record the feedback file path

The feedback file path is deterministic. Compute it now and remember it:

```
FEEDBACK_FILE="$HTML_DIR/feedback.feedback.json"
```

The server derives this as `<html-file-dir>/<basename-without-ext>.feedback.json`. Since the HTML file is `$HTML_DIR/feedback.html`, the feedback file will be `$HTML_DIR/feedback.feedback.json`. Do not glob for it later — use this exact path.

---

## Step 3 — Start the server

Run the server as a **background process** (Bash tool `run_in_background: true`). Do not foreground it — a foreground call blocks and the round-trip never completes.

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/server.js "$HTML_DIR/feedback.html"
```

Optional flags:
- `--port N` — bind to a specific port instead of a random one (rarely needed).
- `--timeout-sec N` — override the 1800 s (30 min) default timeout.

On startup the server prints two lines to stdout:

```
[html-ask] URL: http://127.0.0.1:<port>/
[html-ask] Feedback file: /tmp/html-ask-.../feedback.feedback.json
```

Wait until you see these lines, then surface the URL to the user. Render it as a
**markdown link** (`[label](url)`) — not a bare or bold URL string — so it shows as
clickable text in the terminal. Example message to the user:

> Your feedback form is ready → **[Open feedback form](http://127.0.0.1:PORT/)**
>
> Click that link, answer the questions, and click "Submit feedback". I will continue as soon as you submit.

The server exits with code 0 after the first successful submit, which causes the harness to re-invoke Claude. Do not poll or attempt to read the feedback file while the server is running.

---

## Step 4 — Read back the feedback

When the harness re-invokes Claude after server exit, read the feedback file:

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

Full schema: `${CLAUDE_PLUGIN_ROOT}/skills/html-ask/references/submit-schema.md`.

How to interpret each field:

| Field | How to use it |
|---|---|
| `verdict` | Overall user decision. `approve` → proceed as planned. `approve-with-changes` → incorporate the feedback then proceed. `reject` → rethink; discuss alternatives. `""` (empty) → no verdict given; do not assume approval (see below). |
| `answers` | Map from `data-qid` slug to answer value. Text widgets → string. Radio → selected value string, or `null` if unanswered. Checkbox → array of selected value strings (may be `[]`). Approaches column → per-column key `<qid>-<approach-id>` with value `"approve"`, `"reject"`, or `null` if unanswered. |
| `comments` | Per-question free-text notes. Each has `anchor` (`#<qid>`, e.g. `"#q-timeline"`) and `text`. Treat as the user's free-text answer or comment for that specific question. |
| `freeform` | Free-text field. May be empty string. If non-empty, treat as general feedback. |

After reading the feedback, continue the original task:
- If `verdict` is `approve`: proceed.
- If `verdict` is `approve-with-changes`: acknowledge each piece of feedback explicitly, then proceed with the changes incorporated.
- If `verdict` is `reject`: summarise the rejection reason from freeform/comments and open a discussion about the path forward.
- If `verdict` is empty (`""`): the user submitted without choosing a verdict. Do NOT treat this as approval. Use whatever answers, notes, and freeform were provided, and ask the user for the missing verdict before proceeding on anything that depends on it.

### Partial submissions

The user can submit at any time, even with questions left unanswered — the form never forces a complete response. An unanswered question shows up as an empty string (text), `null` (radio), `[]` (checkbox), or `null` for an approaches column. When you continue, do NOT silently guess at missing answers: explicitly tell the user which questions you are treating as unanswered, listing them by their question text, and ask any follow-up you genuinely need in chat.

---

## Step 5 — Clean up the temp directory

Once you have read the feedback file and extracted everything you need from it, delete
the per-invocation temp directory:

```bash
rm -rf "$HTML_DIR"
```

The server process has already exited by this point (it self-terminates on submit), so
only the directory remains. Removing it keeps `$TMPDIR` from accumulating stale
`html-ask-*` directories across invocations. Do this only *after* the read-back in
Step 4 — the feedback JSON lives inside `$HTML_DIR`.
