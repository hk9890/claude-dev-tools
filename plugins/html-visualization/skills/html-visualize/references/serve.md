# Shared Serve Procedure

Single source of truth for the server lifecycle used by all three modes of the
`html-visualize` workflow: **ask**, **feedback**, and **visualize**.

> **Authoritative contract**: the `.port` file persistence and the `fb-generation`
> polling contract for the feedback Apply loop are defined **here** — mode-specific
> files refer back to this document for those rules.

---

## Pre-flight — check Node.js

Before writing any file or surfacing any URL, run:

```bash
node --version
```

If the command fails (Node is absent or not on PATH):
- **ask mode**: ask questions in chat as plain text; tell the user Node is
  unavailable.
- **feedback mode**: present the content and take feedback in chat; tell the user
  Node is unavailable.
- **visualize mode**: display the content as text in chat; tell the user Node is
  unavailable.

Only proceed past this step when `node --version` succeeds.

---

## Temp directory

Create a unique per-invocation temp directory:

```bash
TMPDIR_BASE=$(node -e "process.stdout.write(require('os').tmpdir())")
HTML_DIR="$TMPDIR_BASE/<mode>-$(date +%s)-$$"
mkdir -p "$HTML_DIR"
```

Replace `<mode>` with `html-ask`, `html-feedback`, or `html-visualize` depending
on the active mode. The directory must be unique per invocation — never reuse one
from a previous invocation.

**Feedback mode only**: this directory is created **once** and reused for every
Apply round of the same skill invocation. It is deleted only after a final Submit.
All per-invocation files — the HTML document, the feedback JSON, and the `.port`
file — live here.

---

## Server cycles

There are three distinct server cycles, one per mode.

### Cycle A — Blocking submit round-trip (ask mode)

Used by **ask** mode. The server waits for the user to submit the form, then
exits and re-invokes Claude with the feedback file.

**Start the server as a background process (`run_in_background: true`)**:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/server.js "$HTML_DIR/feedback.html"
```

On startup the server prints two lines:

```
[html-visualization] URL: http://127.0.0.1:<port>/
[html-visualization] Feedback file: /tmp/html-ask-.../feedback.feedback.json
```

Wait until you see both lines, then surface the URL to the user as a markdown
link. Do not poll or read the feedback file while the server is running.

The server exits with code 0 after the first successful submit, causing the
harness to re-invoke Claude with the feedback available at:

```
FEEDBACK_FILE="$HTML_DIR/feedback.feedback.json"
```

This path is deterministic (the server derives `<html-dir>/<basename-without-ext>.feedback.json`);
record it when you start the server so you can read it back without globbing.

**Optional flags**: `--port N` (fixed port), `--timeout-sec N` (default 1800 s).

### Cycle B — Non-blocking serve-and-continue (visualize mode)

Used by **visualize** mode. The server serves the HTML page and returns
immediately; Claude continues without waiting for any submit. The `--no-wait` flag
activates this cycle. In this mode POST `/submit` is not accepted (405).

**Start the server as a background process (`run_in_background: true`)**:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/server.js "$HTML_DIR/visualization.html" --no-wait
```

On startup the server prints one line (no Feedback file line in `--no-wait` mode):

```
[html-visualization] URL: http://127.0.0.1:<port>/
```

Surface the URL to the user as a markdown link, then continue immediately — do
not wait for a submit. The server self-terminates on timeout (default 1800 s).

**Optional flags**: `--timeout-sec N`.

### Cycle C — Apply loop (feedback mode)

Used by **feedback** mode. The server is one-shot per round (exits 0 after each
submit), but the same port is re-used across Apply rounds so the user's open browser
tab keeps working.

#### First round

**Start the server as a background process (`run_in_background: true`)**:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/server.js "$HTML_DIR/review.html"
```

On startup the server prints two lines:

```
[html-visualization] URL: http://127.0.0.1:<port>/
[html-visualization] Feedback file: /tmp/html-feedback-.../review.feedback.json
```

**Capture the port immediately** and save it — every subsequent Apply round must
re-serve on the same port so the user's open tab keeps working:

```bash
echo "<port>" > "$HTML_DIR/.port"
```

Surface the URL to the user as a markdown link. Do not poll or read the feedback
file while the server is running.

The server exits with code 0 after the user clicks either "Apply & preview" or
"Submit & finish", causing the harness to re-invoke Claude.

The feedback file path is deterministic:

```
FEEDBACK_FILE="$HTML_DIR/review.feedback.json"
```

#### Apply rounds (iterate)

After each `action: "apply"` response:

1. Apply the feedback to the underlying content source.
2. Regenerate `$HTML_DIR/review.html` from the updated content with a **fresh
   `fb-generation` value** — this is what triggers the open browser tab to
   auto-reload. The value MUST differ on every regeneration (e.g. `date +%s%N`);
   a stale value means the page never reloads.
3. Re-serve on the **same port** (`run_in_background: true`):
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/bin/server.js "$HTML_DIR/review.html" --port "$(cat "$HTML_DIR/.port")"
   ```
   If the port is momentarily unavailable, wait ~1 s and retry once.
4. Tell the user the comments have been applied; the URL is unchanged and the
   open tab reloads itself automatically.
5. The loop continues until an `action: "submit"` response.

#### `.port` + `fb-generation` contract (authoritative)

- **`.port` file** (`$HTML_DIR/.port`): written on the first serve round (Cycle C
  first round), never overwritten. Contains only the port number as a plain string.
  Used by every Apply re-serve via `--port "$(cat "$HTML_DIR/.port")"`.
- **`fb-generation` meta**: `<meta name="fb-generation" content="...">` in the
  served HTML. MUST be set to a **new, unique value on every regeneration** (e.g.
  the output of `date +%s%N`). `app.js` polls `GET /` and auto-reloads the open
  tab when it sees a changed value. A reused value means the page never reloads.

---

## Surfacing the URL

In all three cycles, render the URL as a **markdown link**, not a bare URL string:

```
[Open feedback form](http://127.0.0.1:PORT/)
```

This makes it clickable in the terminal. Include a brief instruction for what the
user should do after opening it.

---

## Cleanup

### ask mode (Cycle A)

After reading the feedback file in the read-back step, delete the temp directory:

```bash
rm -rf "$HTML_DIR"
```

The server has already exited; only the directory remains.

### feedback mode (Cycle C)

Delete the temp directory **only after a final `action: "submit"` round**, once
you have applied the feedback:

```bash
rm -rf "$HTML_DIR"
```

Do NOT delete on an Apply round — the directory holds the `.port` file and the
`review.html` you just re-served.

### visualize mode (Cycle B)

The server self-terminates on timeout. No cleanup step is needed unless you want
to proactively remove the HTML file:

```bash
rm -rf "$HTML_DIR"   # optional; the server has already exited after timeout
```
