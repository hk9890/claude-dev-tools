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

Create a unique per-invocation temp directory and resolve the plugin root in the
same Bash call:

```bash
TMPDIR_BASE=$(node -e "process.stdout.write(require('os').tmpdir())")
HTML_DIR="$TMPDIR_BASE/<mode>-$(date +%s)-$$"
mkdir -p "$HTML_DIR"
# Resolve the plugin root once and persist it for server-start commands.
# $CLAUDE_PLUGIN_ROOT is NOT exported into Bash tool subprocesses; use find instead.
PLUGIN_ROOT=$(find /home/hans/.claude/plugins/cache/claude-dev-tools/html-visualization \
  -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)
echo "$PLUGIN_ROOT" > "$HTML_DIR/.plugin-root"
```

Replace `<mode>` with `html-ask`, `html-feedback`, or `html-visualize` depending
on the active mode. The directory must be unique per invocation — never reuse one
from a previous invocation.

> **Why `find` instead of `$CLAUDE_PLUGIN_ROOT`**: `$CLAUDE_PLUGIN_ROOT` is a
> harness token substituted only in plugin-config contexts (hook scripts,
> settings.json). It is **not** exported into the environment of Bash tool
> invocations. Any skill text that uses `$CLAUDE_PLUGIN_ROOT` in a `Bash` call
> will silently expand to an empty string, producing broken paths. Always resolve
> the plugin root via `find` as shown above.

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
node "$(cat "$HTML_DIR/.plugin-root")/bin/server.js" "$HTML_DIR/feedback.html"
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

### Cycle B — Non-blocking serve-and-continue with optional submit (visualize mode)

Used by **visualize** mode. The server serves the HTML page; Claude continues
immediately without waiting for any submit. The `--no-wait` flag activates this
cycle. The page has an always-on footer (Send / Save buttons) — the user may
optionally send a message back, but Claude does not block on it.

**Start the server as a background process (`run_in_background: true`)**:

```bash
node "$(cat "$HTML_DIR/.plugin-root")/bin/server.js" "$HTML_DIR/visualization.html" --no-wait
```

On startup the server prints one line (no Feedback file line in `--no-wait` mode):

```
[html-visualization] URL: http://127.0.0.1:<port>/
```

Surface the URL to the user as a markdown link, then continue immediately — do
not block waiting for a submit.

**Optional submit / close round-trip.** After Claude continues, one of three things
happens:

| Outcome | What the server does |
|---|---|
| User types a non-empty message and clicks **Send** | Writes `<basename>.feedback.json`, exits 0 → harness re-invokes Claude with the feedback file |
| User clicks **Send** with an empty message, closes the tab, or navigates away | Exits 0 silently — no feedback file written, Claude is not re-invoked |
| Timeout (default 1800 s) is reached with no submit | Exits 0 silently — no feedback file written, Claude is not re-invoked |

All three paths exit 0. The only path that produces a feedback file (and a harness
re-invocation of Claude) is a non-empty `freeform` field in the POST payload.

**Optional flags**: `--timeout-sec N`.

### Cycle C — Apply loop (feedback mode)

Used by **feedback** mode. The server is one-shot per round (exits 0 after each
submit), but the same port is re-used across Apply rounds so the user's open browser
tab keeps working.

#### First round

**Start the server as a background process (`run_in_background: true`)**:

```bash
node "$(cat "$HTML_DIR/.plugin-root")/bin/server.js" "$HTML_DIR/review.html"
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
   node "$(cat "$HTML_DIR/.plugin-root")/bin/server.js" "$HTML_DIR/review.html" --port "$(cat "$HTML_DIR/.port")"
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

The server self-terminates on timeout (or after a non-empty submit). No cleanup
step is needed unless you want to proactively remove the HTML file:

```bash
rm -rf "$HTML_DIR"   # optional; the server has already exited after timeout or submit
```

If the user sent a non-empty message, a `<basename>.feedback.json` is present in
`$HTML_DIR` when the server exits. The harness passes its path to Claude on
re-invocation; Claude may delete `$HTML_DIR` after reading the file.
