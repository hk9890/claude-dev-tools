# visualize mode

Render a display-only HTML visualization — a diagram, chart, data summary,
interactive demo, or any rich visual — serve it non-blocking via the `--no-wait`
flag, and continue immediately. The user opens the page in a browser to view it;
there is no submit round-trip.

The shared serve procedure (pre-flight, temp dir, server startup, URL surfacing,
cleanup) lives in `references/serve.md` — Cycle B (non-blocking serve-and-continue).
This file covers visualize-specific content authoring and rendering guidance.

---

## When to use visualize mode

**Use visualize mode when:**

1. The intent is to *show* something — a dependency graph, metric dashboard,
   timeline, comparison chart, data table, architecture diagram, or any visual
   that is better experienced in a browser than read in chat.
2. The user says things like "show me", "visualize", "render as a chart",
   "draw a diagram", "display this as HTML".
3. The output is purely informational — there are no questions to answer and no
   prose to annotate or revise.

**Do NOT use visualize mode when:**

- The user needs to answer questions or make decisions → use ask mode instead.
- The user wants to annotate or iterate on a piece of prose → use feedback mode instead.
- The content is short enough that in-chat text is equally clear.
- Node.js is not available (see pre-flight in `references/serve.md`).

**When unsure, bias toward chat — or use the intent classification rules in
`SKILL.md` to decide.**

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

See `references/serve.md` — temp directory section. Use the prefix
`html-visualize`:

```bash
TMPDIR_BASE=$(node -e "process.stdout.write(require('os').tmpdir())")
HTML_DIR="$TMPDIR_BASE/html-visualize-$(date +%s)-$$"
mkdir -p "$HTML_DIR"
```

### 2b. Copy the template

Copy `${CLAUDE_PLUGIN_ROOT}/skills/visualize-html/references/visualize-template.html`
into `$HTML_DIR/visualization.html`.

The template has a content area, an inline `<style>` block with light/dark colour
tokens, and one structural placeholder section. Remove all placeholder comments
and fill in the real content.

### 2c. Fill in the content

Replace the `<title>`, `<h1>`, and `.subtitle` placeholders with your page title
and subtitle.

Render the visualization inside `<main class="vis-content">`. Use the full HTML
visual toolbox — see [Choosing a rendering approach](#choosing-a-rendering-approach)
and [Visual quality rules](#visual-quality-rules) below.

Author extra or overriding styles in the existing `<style>` block in `<head>` —
do NOT reference `/assets/…` server-served files; the page must be self-contained
so it opens correctly as a `file://` URL if the user saves it.

No CSRF token, no submit button, no feedback machinery of any kind.

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
`var(--vis-accent)`, `var(--vis-muted)`, etc. This ensures the SVG respects the
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

These rules apply regardless of which rendering form you choose.

**Self-contained.** Every resource the page needs must be either inline (SVG,
CSS, JS) or fetched from a CDN. Do NOT reference `/assets/…` server paths or
any path that only exists on the local filesystem.

**Legible in light and dark mode.** The template's `<style>` block includes
`prefers-color-scheme: dark` overrides for the background, text, and surface
colours. When you add chart colours or diagram fills, use the CSS custom
properties (`--vis-bg`, `--vis-text`, `--vis-card`, `--vis-accent`,
`--vis-muted`) so the page adapts automatically. For SVG fills and strokes, prefer
`currentColor` or `var(--vis-accent)`.

**Responsive.** Use `max-width: 900px; margin: 0 auto` on the content container
(already in the template). For SVGs, set `width="100%"` plus a `viewBox`. For
tables, wrap in `<div style="overflow-x: auto">`. The user may open the page on
any screen.

**Purposeful.** Every visual element — label, legend, colour distinction, tick
mark — must carry information. Do not decorate. If a legend identifies four
colours, use four colours; if there are two, use two.

**Self-explanatory.** The page title, subtitle, and any axis labels or legend
entries should let a reader understand what they are looking at without prior chat
context.

---

## Step 3 — Start the server (Cycle B, non-blocking)

See `references/serve.md` — Cycle B (non-blocking serve-and-continue).

Start the server as a background process (`run_in_background: true`):

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/server.js "$HTML_DIR/visualization.html" --no-wait
```

Wait until you see the startup line:

```
[html-visualization] URL: http://127.0.0.1:<port>/
```

There is no "Feedback file" line in `--no-wait` mode — do not wait for one.

Surface the URL to the user as a markdown link, then continue immediately:

> Your visualization is ready → **[Open visualization](http://127.0.0.1:PORT/)**
>
> Open that link in your browser to view it.

Do NOT wait for a submit. There is none. The server self-terminates on timeout
(default 1800 s) with exit 0.

---

## Step 4 — Continue without read-back

After surfacing the URL, continue the conversation immediately. There is no
feedback file, no blocking wait, no read-back step.

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

There is no feedback file to read or preserve.

---

## `file://` vs server — decision

Even though a fully self-contained visualization page (inline SVG, no CDN
libraries) would open correctly as a `file://` URL, visualize mode always serves
via the server. Reasons:

1. **Consistency** — all three modes share one pre-flight and one server lifecycle
   (`references/serve.md`). A mode-specific bypass adds a branch every author
   and future reader must know about.
2. **Cleanup** — the server's timeout ensures the temp directory is eventually
   reaped. A bare `file://` page has no cleanup hook.
3. **CDN pages need a server anyway** — when the page includes a CDN `<script>`,
   `file://` security restrictions in some browsers block cross-origin script loads.
   Serving from `127.0.0.1` avoids this entirely.
4. **Same URL surface** — the markdown link pattern (`[Open visualization](http://…)`)
   is consistent with ask and feedback modes; `file://` paths with spaces and OS
   temp-dir prefixes are harder to render as clickable links.

> **Degraded-environment fallback only**: if the user's environment has Node but not
> a browser that can reach localhost (e.g. a remote SSH session with no port
> forwarding), the server URL is not reachable. In that case, offer to save the HTML
> file to a user-specified path so they can open it directly. This is a last-resort
> accommodation — the normal path is always to serve via the server.
