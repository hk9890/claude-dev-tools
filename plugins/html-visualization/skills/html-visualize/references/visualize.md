# visualize mode

Render an HTML visualization — a diagram, chart, data summary, interactive demo,
or any rich visual — serve it non-blocking via the `--no-wait` flag, and continue
immediately. The user opens the page in a browser to view it. Every visualize page
has an always-on footer with a "Message to Claude" textarea and **Send** / **Save**
buttons; the user may optionally send a message back, but Claude does not wait for
it.

The shared serve procedure (pre-flight, temp dir, server startup, URL surfacing,
cleanup) lives in `references/serve.md` — Cycle B (non-blocking serve-and-continue).
This file covers visualize-specific content authoring and rendering guidance.

---

## Scope of visualize mode

The user invoked visualize mode explicitly — build the visualization. Visualize
mode produces a rich page — a dependency graph, metric dashboard, timeline,
comparison chart, data table, architecture diagram, or any rich visual the user
opens in a browser.

Fall back to plain chat in only two cases:

- **Node.js is unavailable** — see pre-flight in `references/serve.md`.
- **The intent does not fit** — e.g. the user needs to answer questions (ask
  mode) or annotate prose (feedback mode). Say so briefly and handle it the right
  way.

---

## Step 0 — Pre-flight

See `references/serve.md` — pre-flight section. Run `node --version`; if it
fails, display the content as text in chat and tell the user Node is unavailable.

---

## Step 1 — Decide what to render

Before writing any HTML, plan the visualization:

- **Page title and subtitle**: a short title and one sentence describing what the
  user is viewing.
- **Primary visual**: choose the right form for the data or concept (see
  [Choosing a rendering approach](#choosing-a-rendering-approach) below).
- **Supporting content**: labels, legends, summary text, footnotes — anything
  that makes the visual self-explanatory without further chat.

Decide the full layout now. The goal is a single, cohesive page the user can
bookmark and share; it should make sense with no prior context from the chat.

---

## Step 2 — Build the HTML document

### 2a. Create the temp directory

See `references/serve.md` — temp directory section, the single source of truth
for this block. Use the prefix `html-visualize`. Run the full block from that
section, which creates the directory **and** writes `$HTML_DIR/.plugin-root`.

### 2b. Author the destination from the template

Read the template using its resolved absolute path (use the `.plugin-root` file
written in Step 2a):

```
Read: "$(cat "$HTML_DIR/.plugin-root")/skills/html-visualize/references/visualize-template.html"
```

Then author `$HTML_DIR/visualization.html` **with the Write tool**, using the
template content as your starting structure.

> **Write succeeds on the first call when the destination path does not yet
> exist** — that is the intended path. Do NOT create the file first via `cp`,
> `touch`, or a shell redirect and then Write to it. If the file already exists
> at the destination path (stale temp dir), the harness requires a prior Read.
> Because the temp directory is always unique per invocation (`$(date +%s)-$$`),
> this situation should never arise — if it does, it means the temp dir was
> reused, which violates the uniqueness rule.

The template has a content area, an inline `<style>` block with light/dark colour
tokens, and one structural placeholder section. Remove all placeholder comments
and fill in the real content.

### 2c. Fill in the content

Replace the `<title>`, `<h1>`, and `.subtitle` placeholders with your page title
and subtitle.

Render the visualization inside `<main class="vis-content">`. Use the full HTML
visual toolbox — see [Choosing a rendering approach](#choosing-a-rendering-approach)
and [Visual quality rules](#visual-quality-rules) below.

Author extra or overriding styles in the existing `<style>` block in `<head>` — see
[Visual quality rules](#visual-quality-rules) for the self-contained constraint.

The template already contains the always-on footer (`.vis-footer`) and the Send /
Save JavaScript — do not remove or modify these. Do not add a second submit form or
duplicate the feedback footer.

---

## Choosing a rendering approach

Pick the simplest form that communicates the data clearly.

| Content | Recommended form |
|---|---|
| Hierarchy or graph with few nodes (< ~30) | Inline SVG |
| Quantitative comparison (bar, line, scatter) | Inline SVG or a CDN chart library |
| Tabular data | HTML `<table>` with `<thead>`/`<tbody>` |
| Architecture or flow diagram | Inline SVG |
| Text-heavy summary | Semantic HTML (`<dl>`, `<ul>`, `<section>`) |
| Interactive / animated (timeline, treemap, force graph) | CDN chart library |

### Inline SVG (preferred when feasible)

For diagrams and charts with a bounded set of elements, inline SVG is the best
choice: no external dependency, no network round-trip, works offline, renders
instantly.

Write the SVG directly inside `<main class="vis-content">`. Use `viewBox` to make
it scale; set `width="100%"` and a fixed `height` (or `height="auto"` with an
aspect ratio). Keep coordinates round numbers — precision beyond a pixel is noise.

For colour, use the CSS custom properties already defined in the `<style>` block:
`var(--hv-accent)`, `var(--hv-muted)`, etc. This ensures the SVG respects the
dark/light theme.

### CDN chart library (acceptable for complex or interactive charts)

When inline SVG would be prohibitively verbose or the visualization needs
interactivity (zoom, tooltip, animation), load a chart library from a CDN. The
most useful choices:

| Library | CDN snippet | Best for |
|---|---|---|
| Chart.js | `<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>` | Bar, line, pie, doughnut |
| D3.js | `<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>` | Force graph, treemap, custom |
| Mermaid | `<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>` | Flowcharts, sequence diagrams |

Add the `<script>` tag to `<head>`. Write the chart initialisation in an inline
`<script>` at the bottom of `<body>`. Keep the initialisation self-contained —
no module bundler, no `import` statements.

> **Tradeoff**: a CDN `<script>` requires a network connection when the page first
> loads. A user who saves the file and opens it offline will see a blank chart.
> Prefer inline SVG when the chart can be encoded statically.

### HTML table

For data with clear rows and columns, a `<table>` with `<thead>` and `<tbody>` is
often the clearest choice. Use `<caption>` for the table title, `<th scope="col">`
headers, and `scope="row"` for row headers. Stripe rows with CSS
(`tbody tr:nth-child(even)`) for legibility. Do not use `<table>` for layout.

---

## Visual quality rules

Follow the **Authoring guidelines — all modes** in the `html-visualize` `SKILL.md`
(already loaded) — stand-alone page, scannable, purposeful visuals, legible in
light and dark. Visualize mode adds three specifics, whatever rendering form you
chose:

**Self-contained.** Every resource must be inline (SVG, CSS, JS) or fetched from
a CDN. Do NOT reference `/assets/…` server paths or any path that exists only on
the local filesystem — the page must render correctly even when saved and opened
as a `file://` URL.

**Theme-aware colours.** When you add chart colours or diagram fills, use the
template's CSS custom properties (`--hv-bg`, `--hv-text`, `--hv-surface`,
`--hv-accent`, `--hv-muted`) so the page follows the light/dark theme. For SVG
fills and strokes, prefer `currentColor` or `var(--hv-accent)`.

**Responsive visuals.** Keep `max-width: 900px; margin: 0 auto` on the content
container (already in the template). For SVGs, set `width="100%"` plus a
`viewBox`. Wrap wide tables in `<div style="overflow-x: auto">`.

---

## Step 3 — Start the server (Cycle B, non-blocking)

See `references/serve.md` — Cycle B (non-blocking serve-and-continue).

Start the server as a background process (`run_in_background: true`):

```bash
node "$(cat "$HTML_DIR/.plugin-root")/bin/server.js" "$HTML_DIR/visualization.html" --no-wait
```

Wait until you see the startup line:

```
[html-visualization] URL: http://127.0.0.1:<port>/
```

There is no "Feedback file" line in `--no-wait` mode — do not wait for one.

Surface the URL to the user as a markdown link:

> Your visualization is ready → **[Open visualization](http://127.0.0.1:PORT/)**
>
> Open that link in your browser to view it. You can optionally type a message in
> the footer and click **Send** to share feedback or a follow-up request — or click
> **Save** to download a copy of the page.

Continue immediately after surfacing the URL — do not wait for a submit. The server
self-terminates on timeout (default 1800 s) with exit 0.

---

## Step 4 — Continue; a feedback file may arrive later

After surfacing the URL, continue the conversation immediately. The server runs
non-blocking in the background.

The three submit outcomes are tabulated in `references/serve.md` — Cycle B. Full
submit schema (payload shape, CSRF, feedback file format):
`"$(cat "$HTML_DIR/.plugin-root")/skills/html-visualize/references/visualize-submit-schema.md"`.

If the user later asks to update or re-render the visualization, run the full
procedure again from Step 1 — create a fresh temp directory, build a new HTML
file, and serve it.

---

## Step 5 — Cleanup

See `references/serve.md` — cleanup section (visualize mode). The server
self-terminates on timeout; the temp directory is left behind. Cleanup is
optional:

```bash
rm -rf "$HTML_DIR"   # optional; the server has already exited after timeout
```

If the user sent a message, a `visualization.feedback.json` file will be present in
`$HTML_DIR` when the server exits; the harness passes its path to Claude on
re-invocation. When performing re-invocation cleanup, you may delete `$HTML_DIR`
after reading the feedback file.

---

## `file://` vs server — decision

Even though a fully self-contained visualization page (inline SVG, no CDN
libraries) would open correctly as a `file://` URL, visualize mode always serves
via the server. Reasons:

1. **Consistency** — all three modes share one pre-flight and one server lifecycle
   (`references/serve.md`).
2. **Cleanup** — the server's timeout ensures the temp directory is eventually
   reaped. A bare `file://` page has no cleanup hook.
3. **CDN pages need a server anyway** — when the page includes a CDN `<script>`,
   `file://` security restrictions in some browsers block cross-origin script loads.
   Serving from `127.0.0.1` avoids this entirely.
4. **Same URL surface** — the markdown link pattern (`[Open visualization](http://…)`)
   is consistent with ask and feedback modes; `file://` paths with spaces and OS
   temp-dir prefixes are harder to render as clickable links.

**Send is inert in saved / offline copies.** When the user clicks **Save**, the page
produces a self-contained HTML download with the CSRF token stripped and the Send
button disabled. This is intentional: a saved copy opened as a `file://` URL cannot
reach the server, so Send cannot work. Save is the intended "keep this page offline"
path; Send requires the live server.

> **Degraded-environment fallback only**: if the user's environment has Node but not
> a browser that can reach localhost (e.g. a remote SSH session with no port
> forwarding), the server URL is not reachable. In that case, offer to save the HTML
> file to a user-specified path so they can open it directly. This is a last-resort
> accommodation — the normal path is always to serve via the server.
