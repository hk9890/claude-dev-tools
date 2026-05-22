---
name: html-feedback
description: "This skill should be used when the user wants to review a piece of existing content — a document, draft, article, plan write-up, set of notes, or any prose — by marking it up with inline comments, rather than answering structured questions. It renders the content as an HTML page where the user hovers any paragraph, heading, list, or code block, optionally selects a phrase, and attaches a free-text comment (e.g. 'remove this paragraph', 'tighten this sentence'); Claude then applies the comments. Triggers on phrases like 'show me this as HTML so I can comment on it', 'let me mark up this document', 'render this draft so I can annotate it', 'let me annotate this draft', 'present this markdown so I can comment on specific parts'. Does NOT apply when Claude needs structured answers to specific questions or approve/reject decisions — use html-ask for that. Does not apply to short content where in-chat feedback is faster, or when the user wants a quick verbal reaction. When unsure between this and html-ask: html-ask asks the user questions; html-feedback shows the user content to react to."
---

## What this skill does

Render a piece of content as an interactive HTML document, serve it locally, and
let the user attach inline comments to any block of it (and selected phrases
within a block). Wait for the user to submit via browser, read the comments back,
then apply them to the underlying content.

The typical use: the user is working on a document (often markdown) and wants to
review it visually and leave precise, located feedback — far easier than quoting
line numbers in chat.

This skill **shows the user content to react to**. If instead you need the user to
**answer specific questions** or make approve/reject decisions, use `html-ask`.

---

## When to use

**Use html-feedback when:**

1. The user wants to review or edit a document, draft, or any substantial prose
   and leave feedback tied to specific parts of it.
2. The user explicitly asks to "comment on", "mark up", "annotate", or "review"
   content rendered as HTML.
3. You are about to present a non-trivial piece of content the user will want to
   revise, and located feedback would be clearer than a chat back-and-forth.

**Do NOT use html-feedback when:**

- You need structured answers to specific questions → use `html-ask`.
- The content is short enough that in-chat feedback is faster.
- Node.js is not available (see pre-flight below).

**When unsure, bias toward asking in chat instead.**

---

## Step 0 — Pre-flight: check Node.js

Before writing any file or surfacing any URL, run:

```bash
node --version
```

If the command fails (Node is absent or not on PATH), do NOT build the HTML
document. Instead, present the content and take feedback in chat, and tell the
user: "Node.js is not available on this system, so I cannot serve the interactive
review page. I'll show the content here instead."

Only proceed to Step 1 when `node --version` succeeds.

---

## Step 1 — Decide what to render

Before writing any HTML, decide:

- **What content** goes on the page — the document, draft, or section under
  review. Render the *current* version; the comments will say what to change.
- **Page title and subtitle**: a short title and one sentence saying what this is
  and what kind of feedback you want.
- **Blocks**: each paragraph, heading, list, code block, and blockquote becomes
  one commentable block with a stable `data-block-id`. Decide the block breakdown
  now — one logical passage per block.

---

## Step 2 — Build the HTML document

### 2a. Create a unique per-invocation temp directory

```bash
TMPDIR_BASE=$(node -e "process.stdout.write(require('os').tmpdir())")
HTML_DIR="$TMPDIR_BASE/html-feedback-$(date +%s)-$$"
mkdir -p "$HTML_DIR"
```

The directory must be unique per invocation. Never reuse a directory from a
previous invocation.

### 2b. Copy the template

Copy `${CLAUDE_PLUGIN_ROOT}/skills/html-feedback/references/template.html` into
`$HTML_DIR/review.html`.

The template contains example blocks — replace them with the real content. Also
replace the `<title>`, the header `<h1>`, and the `.subtitle` placeholders. Keep
the page structure, freeform section, submit row, and state sections exactly as
in the template.

### 2c. Render the content

Render the content inside `<div id="content">` per the markup contract in
`${CLAUDE_PLUGIN_ROOT}/skills/html-feedback/references/markup.md`. Key rules:

- Replace the `<h1>` / `<title>` and `.subtitle` placeholders.
- Render the content as semantic HTML — headings, paragraphs, lists, tables,
  `<blockquote>`, `<pre><code>` — so it reads the way it should. The page `<h1>`
  is the document title; start in-content headings at `<h2>`.
- Every commentable block is a **direct child of `#content`** with a unique
  `data-block-id` (printable ASCII, no whitespace).
- A whole list is one block — `data-block-id` on the `<ul>`/`<ol>`, not each `<li>`.
- Do NOT add `<script>const CSRF_TOKEN = "...";</script>` — the server injects it.
- The `/assets/feedback/style.css` link and `/assets/feedback/app.js` script are
  correct as-is; do not change the paths.

Consult `${CLAUDE_PLUGIN_ROOT}/skills/html-feedback/references/markup.md` for the
full vocabulary (block rules, required IDs, anchoring behaviour).

### 2d. Use HTML to render the content well

This is a browser document — render the content the way it is meant to be read.
If the source is markdown, convert it faithfully to HTML (real headings, lists,
tables, code blocks — not paragraphs of raw markdown). Beyond that, use HTML's
visual power where it helps the user judge the content:

- **Tables** for tabular data instead of flattening it into prose.
- **Code blocks** (`<pre><code>`) with the code shown as code.
- **Colour and badges** — inline `<span>`s with background colour — to mark
  status, draft notes, or "needs work" sections at a glance.
- **Inline SVG or styled `<div>`s** for a small diagram when the content
  describes something spatial or structural.

Keep it faithful to the content. Author any extra styling inline or in a
`<style>` block in `<head>` — never edit the shared `/assets/feedback/style.css`.

### 2e. Compute and record the feedback file path

The feedback file path is deterministic. Compute it now and remember it:

```
FEEDBACK_FILE="$HTML_DIR/review.feedback.json"
```

The server derives this as `<html-file-dir>/<basename-without-ext>.feedback.json`.
Since the HTML file is `$HTML_DIR/review.html`, the feedback file will be
`$HTML_DIR/review.feedback.json`. Do not glob for it later — use this exact path.

---

## Step 3 — Start the server

Run the server as a **background process** (Bash tool `run_in_background: true`).
Do not foreground it — a foreground call blocks and the round-trip never completes.

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/server.js "$HTML_DIR/review.html"
```

Optional flags:
- `--port N` — bind to a specific port instead of a random one (rarely needed).
- `--timeout-sec N` — override the 1800 s (30 min) default timeout.

On startup the server prints two lines to stdout:

```
[html-visualization] URL: http://127.0.0.1:<port>/
[html-visualization] Feedback file: /tmp/html-feedback-.../review.feedback.json
```

Wait until you see these lines, then surface the URL to the user. Render it as a
**markdown link** (`[label](url)`) so it shows as clickable text. Example message:

> Your review page is ready → **[Open review page](http://127.0.0.1:PORT/)**
>
> Hover any paragraph and click 💬 to comment — select a phrase first to quote it.
> Click "Submit feedback" when done. I will continue as soon as you submit.

The server exits with code 0 after the first successful submit, which causes the
harness to re-invoke Claude. Do not poll or read the feedback file while the
server is running.

---

## Step 4 — Read back and apply the feedback

When the harness re-invokes Claude after server exit, read the feedback file
(the path you computed in Step 2e).

The file contains:

```json
{
  "submittedAt": "<ISO-8601 timestamp>",
  "comments": [
    { "blockId": "<string>", "blockText": "<string>", "quote": "<string>", "text": "<string>" }
  ],
  "freeform": "<string>"
}
```

Full schema: `${CLAUDE_PLUGIN_ROOT}/skills/html-feedback/references/submit-schema.md`.

How to interpret each field:

| Field | How to use it |
|---|---|
| `comments` | Each is one located piece of feedback. `blockId` + `blockText` tell you which passage; `quote` (when non-empty) narrows it to the exact phrase the user selected; `text` is what they want changed. Apply each comment to that passage of the underlying content. |
| `freeform` | Feedback not tied to a block — overall direction, tone, what is missing. May be empty. |

After reading the feedback:

- Apply each comment to the **underlying source** of the content (e.g. the
  markdown file), not just to the rendered HTML — the HTML document is throwaway.
- Acknowledge each comment explicitly as you apply it, so the user can see their
  feedback was understood.
- If a comment is ambiguous, apply your best interpretation and flag it, or ask a
  brief follow-up in chat.
- If both `comments` and `freeform` are empty, the user submitted without leaving
  feedback — ask in chat what they would like changed.

---

## Step 5 — Clean up the temp directory

Once you have read the feedback file and extracted everything from it, delete the
per-invocation temp directory:

```bash
rm -rf "$HTML_DIR"
```

The server process has already exited by this point (it self-terminates on
submit). Do this only *after* the read-back in Step 4 — the feedback JSON lives
inside `$HTML_DIR`.
