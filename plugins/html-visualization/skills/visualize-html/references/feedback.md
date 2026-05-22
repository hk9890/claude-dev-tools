# feedback mode

Render a piece of content as an interactive HTML document, serve it locally, and
let the user attach inline comments to any phrase of it by selecting text. Claude
then applies the comments and can re-render the updated document so the user
iterates until satisfied.

The shared serve procedure (pre-flight, temp dir, server startup, URL surfacing,
cleanup, the `.port` + `fb-generation` contract) lives in `references/serve.md` —
Cycle C (Apply loop). This file covers the feedback-specific content authoring and
read-back.

---

## When to use feedback mode

**Use feedback mode when:**

1. The user wants to review or edit a document, draft, or any substantial prose
   and leave feedback tied to specific parts of it.
2. The user explicitly asks to "comment on", "mark up", "annotate", or "review"
   content rendered as HTML.
3. You are about to present a non-trivial piece of content the user will want to
   revise, and located feedback would be clearer than a chat back-and-forth.

**Do NOT use feedback mode when:**

- You need structured answers to specific questions → use ask mode instead.
- The content is short enough that in-chat feedback is faster.
- Node.js is not available (see pre-flight in `references/serve.md`).

**When unsure, bias toward asking in chat instead.**

**Rule of thumb**: ask mode asks the user questions; feedback mode shows the user
content to react to.

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

## Step 0 — Pre-flight

See `references/serve.md` — pre-flight section. Run `node --version`; if it
fails, present the content and take feedback in chat instead.

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

See `references/serve.md` — temp directory section. Use the prefix
`html-feedback`. This directory is created once and reused for every Apply round.

### 2b. Copy the template

Copy `${CLAUDE_PLUGIN_ROOT}/skills/visualize-html/references/feedback-template.html`
into `$HTML_DIR/review.html`.

The template contains example blocks — replace them with the real content. Also
replace the `<title>`, the header `<h1>`, the `.subtitle`, and the `fb-generation`
meta placeholder. Keep the page structure, freeform section, action row, and state
sections exactly as in the template.

### 2c. Render the content

Render the content inside `<div id="content">` per the markup contract in
`${CLAUDE_PLUGIN_ROOT}/skills/visualize-html/references/feedback-markup.md`. Key rules:

- Set `<meta name="fb-generation" content="...">` to a fresh, unique value (e.g.
  the output of `date +%s%N`). It MUST differ on every regeneration — see the
  `.port` + `fb-generation` contract in `references/serve.md`.
- Replace the `<h1>` / `<title>` and `.subtitle` placeholders.
- Render the content as semantic HTML — headings, paragraphs, lists, tables,
  `<blockquote>`, `<pre><code>`.
- Every commentable block is a **direct child of `#content`** with a unique
  `data-block-id` (printable ASCII, no whitespace).
- A whole list is one block — `data-block-id` on the `<ul>`/`<ol>`, not each `<li>`.
- Do NOT add `<script>const CSRF_TOKEN = "...";</script>` — the server injects it.
- The `/assets/feedback/style.css` link and `/assets/feedback/app.js` script are
  correct as-is; do not change the paths.

Consult `${CLAUDE_PLUGIN_ROOT}/skills/visualize-html/references/feedback-markup.md`
for the full vocabulary (block rules, required IDs, the `fb-generation` meta).

### 2d. Use HTML to render the content well

This is a browser document — render the content the way it is meant to be read.
If the source is markdown, convert it faithfully to HTML (real headings, lists,
tables, code blocks — not paragraphs of raw markdown). Beyond that:

- **Tables** for tabular data instead of flattening it into prose.
- **Code blocks** (`<pre><code>`) with the code shown as code.
- **Colour and badges** — inline `<span>`s with background colour — to mark
  status, draft notes, or "needs work" sections at a glance.
- **Inline SVG or styled `<div>`s** for a small diagram when the content
  describes something spatial.

Author extra styling inline or in a `<style>` block in `<head>` — never edit the
shared `/assets/feedback/style.css`.

### 2e. The feedback file path

```
FEEDBACK_FILE="$HTML_DIR/review.feedback.json"
```

The server writes feedback to `<html-file-dir>/<basename>.feedback.json`. Since
the HTML file is `$HTML_DIR/review.html`, this path is deterministic. Use it
exactly; do not glob for it.

---

## Step 3 — Start the server

See `references/serve.md` — Cycle C (Apply loop). Surface the URL as a markdown
link with the message:

> Your review page is ready → **[Open review page](http://127.0.0.1:PORT/)**
>
> Select any text and click 💬 to comment. Click **Apply & preview** to have me
> apply your comments and refresh the page, or **Submit & finish** when you're done.

**Capture the port and save it** to `$HTML_DIR/.port` immediately after seeing the
startup lines — every Apply re-serve must use `--port "$(cat "$HTML_DIR/.port")"`.

---

## Step 4 — Read the feedback and act on `action`

When the harness re-invokes Claude after server exit, read:

```
FEEDBACK_FILE  (the path from Step 2e)
```

The file contains:

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

Full schema:
`${CLAUDE_PLUGIN_ROOT}/skills/visualize-html/references/feedback-submit-schema.md`.

Interpret the comment fields:

| Field | How to use it |
|---|---|
| `comments` | Each is one located piece of feedback. `blockId` + `blockText` tell you which passage; `quote` (when non-empty) narrows it to the exact phrase; `text` is what they want changed. |
| `freeform` | Feedback not tied to a block — overall direction, tone, what is missing. May be empty. |

**Apply every comment to the underlying source** of the content (e.g. the
markdown file) — not just to the rendered HTML. Acknowledge each comment as you
apply it. If a comment is ambiguous, apply your best interpretation and say so.
If both `comments` and `freeform` are empty, ask in chat what to change.

Then branch on `action`:

### `action: "apply"` — iterate

1. Apply the feedback to the underlying source.
2. Regenerate `$HTML_DIR/review.html` from the updated content with a **fresh
   `fb-generation` value** — see `references/serve.md` Cycle C for the contract.
3. Re-serve on the same port — see `references/serve.md` Cycle C (Apply rounds).
4. Tell the user briefly, e.g. "Applied your 3 comments — the review page will
   refresh automatically." You do not need to resend the link.
5. The loop continues: the user comments on the updated page and submits again.

### `action: "submit"` — finish

1. Apply the feedback to the underlying source.
2. Summarise what changed for the user.
3. Proceed to Step 5 — do **not** re-serve.

---

## Step 5 — Clean up (only after a final Submit)

See `references/serve.md` — cleanup section (feedback mode). Delete `$HTML_DIR`
only after an `action: "submit"` round and only after you have applied everything.
