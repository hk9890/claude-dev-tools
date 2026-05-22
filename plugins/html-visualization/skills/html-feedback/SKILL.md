---
name: html-feedback
description: "This skill should be used when the user wants to review a piece of existing content — a document, draft, article, plan write-up, set of notes, or any prose — by marking it up with inline comments, rather than answering structured questions. It renders the content as an HTML page where the user selects any text and attaches a free-text comment (e.g. 'remove this paragraph', 'tighten this sentence'); Claude then applies the comments, and can re-render the updated document so the user iterates until satisfied. Triggers on phrases like 'show me this as HTML so I can comment on it', 'let me mark up this document', 'render this draft so I can annotate it', 'let me annotate this draft', 'present this markdown so I can comment on specific parts'. Does NOT apply when Claude needs structured answers to specific questions or approve/reject decisions — use html-ask for that. Does not apply to short content where in-chat feedback is faster, or when the user wants a quick verbal reaction. When unsure between this and html-ask: html-ask asks the user questions; html-feedback shows the user content to react to."
---

## What this skill does

Render a piece of content as an interactive HTML document, serve it locally, and
let the user attach inline comments to any phrase of it by selecting text. The
user ends each round in one of two ways:

- **Apply & preview** — Claude applies the comments to the underlying content,
  regenerates the document, and re-serves it; the user's page auto-reloads with
  the update. The user can then comment again. This loop repeats as many times
  as the user wants.
- **Submit & finish** — the final round: Claude applies the comments and stops.

The typical use: the user is editing a document (often markdown) and wants to
review it visually, leave precise located feedback, watch Claude apply it, and
iterate — far easier than quoting line numbers in chat.

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

## The round-trip, end to end

```
Step 0  pre-flight (node)
Step 1  decide what to render
Step 2  build review.html in a temp dir   ←──────────────┐
Step 3  serve it (capture the port the first time)       │
        ↓ user comments, clicks a button, server exits   │
Step 4  read the feedback file                           │
        action == "apply"  → apply, regenerate, re-serve ┘  (loop)
        action == "submit" → apply, finish
Step 5  clean up the temp dir   (only after "submit")
```

The temp directory and the server port live for the **whole** loop — one skill
invocation, many Apply rounds — and are cleaned up only after a final Submit.

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

### 2a. Create the temp directory (once for the whole loop)

```bash
TMPDIR_BASE=$(node -e "process.stdout.write(require('os').tmpdir())")
HTML_DIR="$TMPDIR_BASE/html-feedback-$(date +%s)-$$"
mkdir -p "$HTML_DIR"
```

This directory holds `review.html`, the feedback JSON, and a `.port` file. It is
created **once** and reused for every Apply round of this invocation. On an Apply
round (Step 4) you regenerate `review.html` inside this same directory — you do
**not** make a new one.

### 2b. Copy the template

Copy `${CLAUDE_PLUGIN_ROOT}/skills/html-feedback/references/template.html` into
`$HTML_DIR/review.html`.

The template contains example blocks — replace them with the real content. Also
replace the `<title>`, the header `<h1>`, the `.subtitle`, and the
`fb-generation` meta placeholder. Keep the page structure, freeform section,
action row, and state sections exactly as in the template.

### 2c. Render the content

Render the content inside `<div id="content">` per the markup contract in
`${CLAUDE_PLUGIN_ROOT}/skills/html-feedback/references/markup.md`. Key rules:

- Set `<meta name="fb-generation" content="...">` to a fresh, unique value (e.g.
  the output of `date +%s%N`). It MUST differ on every regeneration — the page
  uses it to detect the updated version and auto-reload.
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

To comment, the user selects text and a floating 💬 button appears at the
selection — there is nothing per-block for you to author beyond `data-block-id`.

Consult `${CLAUDE_PLUGIN_ROOT}/skills/html-feedback/references/markup.md` for the
full vocabulary (block rules, required IDs, the `fb-generation` meta).

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

### 2e. The feedback file path

The server writes feedback to `<html-file-dir>/<basename>.feedback.json`. Since
the HTML file is `$HTML_DIR/review.html`, the feedback file is always
`$HTML_DIR/review.feedback.json`. Use that exact path; do not glob for it.

---

## Step 3 — Start the server

Run the server as a **background process** (Bash tool `run_in_background: true`).
Do not foreground it — a foreground call blocks and the round-trip never completes.

**First round** — let the server pick a random port:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/server.js "$HTML_DIR/review.html"
```

On startup the server prints two lines to stdout:

```
[html-visualization] URL: http://127.0.0.1:<port>/
[html-visualization] Feedback file: /tmp/html-feedback-.../review.feedback.json
```

When you see them, **capture the port and save it** — every later Apply round
must re-serve on the *same* port so the user's open tab keeps working:

```bash
echo "<port>" > "$HTML_DIR/.port"
```

Then surface the URL to the user as a **markdown link** (`[label](url)`):

> Your review page is ready → **[Open review page](http://127.0.0.1:PORT/)**
>
> Select any text and click 💬 to comment. Click **Apply & preview** to have me
> apply your comments and refresh the page, or **Submit & finish** when you're done.

Optional flags: `--timeout-sec N` overrides the 1800 s (30 min) default timeout.

The server exits with code 0 after one successful submit, which re-invokes Claude.
Do not poll or read the feedback file while the server is running.

---

## Step 4 — Read the feedback and act on `action`

When the harness re-invokes Claude after server exit, read the feedback file
`$HTML_DIR/review.feedback.json`:

```json
{
  "submittedAt": "<ISO-8601 timestamp>",
  "action": "apply" | "submit",
  "comments": [
    { "blockId": "<string>", "blockText": "<string>", "quote": "<string>", "text": "<string>" }
  ],
  "freeform": "<string>"
}
```

Full schema: `${CLAUDE_PLUGIN_ROOT}/skills/html-feedback/references/submit-schema.md`.

Interpret the comment fields:

| Field | How to use it |
|---|---|
| `comments` | Each is one located piece of feedback. `blockId` + `blockText` tell you which passage; `quote` (when non-empty) narrows it to the exact phrase the user selected; `text` is what they want changed. |
| `freeform` | Feedback not tied to a block — overall direction, tone, what is missing. May be empty. |

**Apply every comment to the underlying source** of the content (e.g. the
markdown file) — not just to the rendered HTML. Acknowledge each comment as you
apply it. If a comment is ambiguous, apply your best interpretation and say so.
If both `comments` and `freeform` are empty, ask in chat what to change.

Then branch on `action`:

### `action: "apply"` — iterate

1. Apply the feedback to the underlying source.
2. Regenerate `$HTML_DIR/review.html` from the updated content (repeat Step 2c)
   with a **fresh `fb-generation` value**.
3. Re-serve on the **same port** — run as a background process again:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/bin/server.js "$HTML_DIR/review.html" --port "$(cat "$HTML_DIR/.port")"
   ```
   If the port is momentarily unavailable, wait ~1 s and retry the same command.
4. Tell the user briefly, e.g. "Applied your 3 comments — the review page will
   refresh automatically." You do not need to resend the link; the URL is
   unchanged and the open tab reloads itself.
5. The loop continues: the user comments on the updated page and submits again.

### `action: "submit"` — finish

1. Apply the feedback to the underlying source.
2. Summarise what changed for the user.
3. Proceed to Step 5 — do **not** re-serve.

---

## Step 5 — Clean up (only after a final Submit)

After an `action: "submit"` round, once you have applied everything, delete the
temp directory:

```bash
rm -rf "$HTML_DIR"
```

Do this **only** after a Submit. On an Apply round the directory must survive —
it holds the port file and the `review.html` you just re-served.
