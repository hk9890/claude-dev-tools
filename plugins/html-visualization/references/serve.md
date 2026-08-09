# Shared Serve Procedure

Single source of truth for the server lifecycle used by all three modes of the
`html-visualize` workflow: **ask**, **feedback**, and **visualize**.

> **Contract**: the `.port` and `.csrf` file persistence, and the generation
> contract for the feedback Apply loop, are defined here.

---

## The heartbeat

A served page holds its server open by **heartbeat**: while the tab is open the
page keeps pinging, and the server exits once the heartbeat stops for
`--grace-sec` (default 900 s). Closing the tab ends it promptly.

Two things follow that change what you do:

- **A link expires whether or not anyone opened it.** The heartbeat clock starts
  at startup, so a link from far back in the scrollback may be dead. Re-serve it
  rather than explaining why it broke.
- **The page knows before the user does.** Once the heartbeat fails, the page
  disables its own submit controls, says it can no longer reach Claude, and
  offers the user's typed text back on the clipboard. An expired page costs a
  re-serve, not the user's work.

## What an exit code means

`--mode` tells the server whether an unanswered page is worth reporting:

| Exit | Means |
|---|---|
| `0` with a feedback file | The user submitted. Read the file. |
| `0`, no feedback file | **visualize only** — the user closed the page, or sent an empty message. The normal ending; say nothing. |
| `2` | **ask and feedback** — the page was closed, or its heartbeat stopped, without a submit. Tell the user, and offer to re-serve or continue in chat. |
| `1` | The server refused to start. The message on stderr says why; do not retry blindly. |

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
# Substitute the absolute path the harness printed as "Base directory for this
# skill:" when it loaded the mode skill (html-visualize-ask, -feedback, or -page).
# That base directory is <plugin root>/skills/html-visualize-<mode>, so ../.. is
# the plugin root, where bin/ and references/ sit — this is the plugin-root
# layout, not the usual per-skill one.
PLUGIN_ROOT=$(cd "<base directory for this skill>/../.." 2>/dev/null && pwd)
if [ -f "$PLUGIN_ROOT/bin/server.js" ]; then
  echo "$PLUGIN_ROOT" > "$HTML_DIR/.plugin-root"
  echo "plugin root: $PLUGIN_ROOT"
else
  echo "ERROR: cannot locate the html-visualization plugin root"
  exit 1
fi
```

If the `ERROR` line prints (the command exits non-zero), stop — do not start a
server. Fall back to the active mode's chat fallback (as in the Node pre-flight)
and tell the user the plugin's files could not be located. Never guess a path in
its place.

Replace `<mode>` with `html-ask`, `html-feedback`, or `html-visualize` depending
on the active mode. The directory must be unique per invocation — never reuse one
from a previous invocation.

> **Why the base directory, and not `$CLAUDE_PLUGIN_ROOT` or `find`**:
> `$CLAUDE_PLUGIN_ROOT` is a harness token substituted only in plugin-config
> contexts (hook scripts, settings.json). It is **not** exported into the
> environment of Bash tool invocations, so in a `Bash` call it silently expands
> to an empty string and produces broken paths. Searching the filesystem is not
> the answer either: a `find` over the install cache can select a stale version
> after a downgrade, and a `find` over `$PWD` can match an unrelated directory in
> whatever repository the user installed this plugin into. The
> `Base directory for this skill:` line the harness prints on every skill load is
> already correct in all three install shapes — dev checkout, `--plugin-dir` run,
> and cached install — so use it.

**Feedback mode only**: this directory is created **once** and reused for every
Apply round of the same skill invocation. It is deleted only after a final Submit.
All per-invocation files — the HTML document, the feedback JSON, and the `.port`
and `.csrf` files — live here.

---

## Authoring files into the temp directory

Author each HTML file **with the Write tool**, directly at its destination path
inside `$HTML_DIR`.

> **Write succeeds on the first call when the destination path does not yet
> exist** — that is the intended path. Do NOT create the file first via `cp`,
> `touch`, or a shell redirect and then Write to it. The temp directory is
> unique per invocation so the destination path is always new.

---

## Server cycles

There are three distinct server cycles, one per mode.

### Cycle A — Blocking submit round-trip (ask mode)

Used by **ask** mode. The server waits for the user to submit the form, then
exits and re-invokes Claude with the feedback file.

**Start the server as a background process (`run_in_background: true`)**:

```bash
node "$(cat "$HTML_DIR/.plugin-root")/bin/server.js" "$HTML_DIR/feedback.html" --mode ask
```

On startup the server prints two lines:

```
[html-visualization] URL: http://<hostname>:<port>/
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

**Abandoned form**: a closed or heartbeat-less page exits **2 with no feedback
file** — read that result off [the exit-code table](#what-an-exit-code-means).
Treat a missing feedback file the same way, whatever the exit code.

**Optional flags**: `--port N` (fixed port), `--grace-sec N` (default 900 s),
`--host NAME` (see [Host allow-list](#host-allow-list)).

### Cycle B — Non-blocking serve-and-continue with optional submit (visualize mode)

Used by **visualize** mode. The server serves the HTML page; Claude continues
immediately without waiting for any submit. `--mode visualize` activates this
cycle. The page has an always-on footer (Send / Save buttons) — the user may
optionally send a message back, but Claude does not block on it.

**Start the server as a background process (`run_in_background: true`)**:

```bash
node "$(cat "$HTML_DIR/.plugin-root")/bin/server.js" "$HTML_DIR/visualization.html" --mode visualize
```

On startup the server prints one line (visualize prints no Feedback file line):

```
[html-visualization] URL: http://<hostname>:<port>/
```

Surface the URL to the user as a markdown link, then continue immediately — do
not block waiting for a submit.

**Optional submit / close round-trip.** After Claude continues, one of three things
happens:

| Outcome | What the server does |
|---|---|
| User types a non-empty message and clicks **Send** | Writes `<basename>.feedback.json`, exits 0 → harness re-invokes Claude with the feedback file |
| User clicks **Send** with an empty or whitespace-only message | Exits 0 silently — no feedback file written, Claude is not re-invoked (the UI trims, so blank input cannot reach the non-empty check) |
| User closes the tab, or the heartbeat stops for `--grace-sec` | Exits 0 silently — no feedback file, Claude is not re-invoked |

All three paths exit 0. The only path that produces a feedback file (and a harness
re-invocation of Claude) is a non-empty `freeform` field in the POST payload.

**Optional flags**: `--grace-sec N`, `--host NAME` (see
[Host allow-list](#host-allow-list)).

### Cycle C — Apply loop (feedback mode)

Used by **feedback** mode. The server is one-shot per round (exits 0 after each
submit), but the same port is re-used across Apply rounds so the user's open browser
tab keeps working.

#### First round

**Start the server as a background process (`run_in_background: true`)**:

```bash
node "$(cat "$HTML_DIR/.plugin-root")/bin/server.js" "$HTML_DIR/review.html" --mode feedback
```

On startup the server prints two lines:

```
[html-visualization] URL: http://<hostname>:<port>/
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

**Abandoned round**: an abandoned round exits **2 with no feedback file**, as in
Cycle A — see [the exit-code table](#what-an-exit-code-means).

#### Apply rounds (iterate)

After each `action: "apply"` response:

1. Apply the feedback to the underlying content source. After reading the
   feedback file, delete it (`rm -f "$HTML_DIR/review.feedback.json"`) — the
   server only overwrites it on the next submit, so a stale copy from this
   round could otherwise be misread as fresh feedback if a later round times
   out.
2. Regenerate `$HTML_DIR/review.html` from the updated content. Rewriting the
   file is the whole protocol: its mtime is the generation the server reports.
3. Re-serve on the **same port** (`run_in_background: true`):
   ```bash
   node "$(cat "$HTML_DIR/.plugin-root")/bin/server.js" "$HTML_DIR/review.html" --mode feedback --port "$(cat "$HTML_DIR/.port")"
   ```
   If the port is momentarily unavailable, wait ~1 s and retry once.
   **Carry every flag the first round used** — in particular `--host NAME` if the
   first round needed one. Flags do not persist across rounds; dropping `--host`
   here gives the user a 403 on round two after round one worked.
4. Tell the user the comments have been applied; the URL is unchanged and the
   open tab reloads itself automatically.
5. The loop continues until an `action: "submit"` response.

#### `.port`, `.csrf` and the generation (authoritative)

- **`.port` file** (`$HTML_DIR/.port`): written by you on the first serve round
  (Cycle C first round), never overwritten. Contains only the port number as a
  plain string. Used by every Apply re-serve via `--port "$(cat "$HTML_DIR/.port")"`.
- **`.csrf` file** (`$HTML_DIR/.csrf`): written by the **server**, mode 0600, on
  the first serve into a directory and reused by every later one. Never create,
  edit, or delete it. It exists so the token already injected into the user's
  open tab stays valid across an Apply restart — mint a fresh one per round and
  that tab's pings start failing, the new server credits no liveness, and it
  counts down to exit with a live page in front of it.
- **`--host NAME`**: not persisted anywhere — if the first round needed one, every
  Apply re-serve must repeat it. See [Host allow-list](#host-allow-list).
- **Generation**: the served file's mtime, which the server injects into the
  page and reports on the heartbeat. Rewriting `review.html` advances it and the
  open tab reloads itself. The document carries nothing — write the file and the
  reload follows.

---

## Host allow-list

`POST /submit` requires the request to address this machine by a name it actually
answers as. The allow-list is built at startup and needs no configuration for the
normal path:

- `localhost`, `127.0.0.1`, `::1`
- `os.hostname()` — the name the printed URL uses
- every address on the machine's own network interfaces

Serving is **not** gated — `GET /` answers under any name, so a page reached
through a forwarder or an alias still displays. Only the submit has to name this
host.

**Why**: the bind is all-interfaces, so the server answers to every name that
resolves here — including one an attacker owns. A page at `attacker.com` whose DNS
re-resolves to this host arrives with `Host: attacker.com`, an `Origin` that agrees
with it, and `Sec-Fetch-Site: same-origin`, because as far as the browser is
concerned it *is* same-origin. The Origin check is deliberately host-relative and
so agrees too; the allow-list is the only check that can tell the two apart. This
is a DNS-rebinding defence, not access control — anyone who can reach the port
still reads the page.

**When a submit 403s**: the server prints the refused host to stderr —

```
[html-visualization] Submit refused: Host "devbox.corp.example" is not a name this machine answers as. Pass --host <name> to allow it.
```

This happens whenever the user reaches the box under a name the list cannot
derive: an FQDN when `os.hostname()` is the short name (or the reverse), an mDNS
`.local` name, a VPN or Tailscale name, a CNAME, or the public host of a
TLS-terminating forwarder (Codespaces, VS Code forwarded ports, ngrok). Re-serve
with that name allow-listed:

```bash
node "$(cat "$HTML_DIR/.plugin-root")/bin/server.js" "$HTML_DIR/review.html" --host devbox.corp.example
```

`--host` is repeatable and **adds to** the defaults rather than replacing them. A
value that is not a hostname exits non-zero at startup rather than failing later
at submit time. In feedback mode (Cycle C) pass the same `--host` on every Apply
re-serve, alongside `--port`.

---

## Surfacing the URL

In all three cycles, render the URL as a **markdown link**, not a bare URL string:

```
[Open feedback form](http://HOST:PORT/)
```

This makes it clickable in the terminal. Include a brief instruction for what the
user should do after opening it and what happens after they act (you continue,
the page loops, or it is just to view) — never leave the user guessing.

**Surface the URL the server printed, verbatim.** The server binds every
interface and names itself in that line by the machine's own hostname, so the
same link works from the user's browser whether Claude is running locally or on a
remote box the user reaches by DNS name. Do not rewrite the host as `127.0.0.1`
or `localhost` on your own initiative — on a remote box that link is dead
everywhere but the serving machine.

**Also tell the user the page is reachable from the network**, in the same
message as the link — one clause is enough ("anyone who can reach this port can
open it"). The all-interfaces bind means anyone who can reach the port can read
the page and submit through it: `GET /` hands out the CSRF token, so that token
proves a request came from the page, not that it came from the user. The user is
the only one who knows whether they are on a trusted network, and they cannot
weigh that if the link arrives without the fact.

Reachability is still the whole boundary for reading. Submitting is narrower —
the [Host allow-list](#host-allow-list) requires a submit to address this machine
by one of its own names — but that only rules out a page on someone else's site
rebinding its way in. It does not narrow who on the network can submit, so the
sentence above stands as written.

### When the printed hostname does not resolve

The hostname is advertised as-is; whether it resolves for the user's browser
depends on their environment. It does not resolve when Claude runs in a container
or devcontainer (`os.hostname()` is a container ID), under WSL2, or on a host with
no DNS record. And a user on an SSH tunnel (`ssh -L PORT:localhost:PORT box`)
reaches the server over loopback, which is the one address that link never names.

If the user reports the link does not open, or tells you they are on a forwarded
port, offer `http://localhost:PORT/` with the **same port** — the server is
listening on every interface, so loopback serves the identical page and the submit
round-trip works normally. This is a response to how the user actually reaches
the machine, not a substitution to make pre-emptively.

If instead the user opens the page fine under some *other* name — a corporate
FQDN, a `.local` name, a Codespaces or ngrok URL — the page displays but the
submit 403s, because that name is not one the allow-list can derive. Re-serve
with `--host <that-name>`; see [Host allow-list](#host-allow-list).

If neither address is reachable, fall back per the active mode:

| Mode | Fallback |
|---|---|
| ask (Cycle A) | Kill the server and ask the questions in chat, rather than leaving the user on a dead link until the heartbeat runs out. |
| feedback (Cycle C) | Kill the server and take the feedback in chat, or write `review.html` to a path the user names so they can open it directly (comments still need the server, so chat is usually the better half). |
| visualize (Cycle B) | Offer to save the HTML to a user-specified path — the page is self-contained and opens as a `file://` URL; only **Send** needs the server. |

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

Do NOT delete on an Apply round — the directory holds the `.port` and `.csrf`
files and the `review.html` you just re-served.

### visualize mode (Cycle B)

Closing the tab is enough — the page gives its port back on its own, so nothing
needs killing in the normal case and only the directory is left behind:

```bash
rm -rf "$HTML_DIR"   # optional; the server exits on its own once the page is gone
```

Kill it explicitly only when the user says they are done while the tab is still
open: an open tab keeps its heartbeat going, so the server has no way to tell
that nobody is looking at it.

```bash
kill "$SERVER_PID" 2>/dev/null   # the background process from Step 3
rm -rf "$HTML_DIR"
```

If the user sent a non-empty message, a `<basename>.feedback.json` is present in
`$HTML_DIR` when the server exits. The harness passes its path to Claude on
re-invocation; Claude may delete `$HTML_DIR` after reading the file.
