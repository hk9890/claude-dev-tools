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

**If the intent is a path to a file that exists, read it — its contents are what you
render.** A path is a hand-off, not a subject: `/html-visualize-demo /tmp/report.md`
means "render this document", never "draw a picture of this filename". Markdown maps
onto the page directly — headings become sections, tables become tables, and fenced
` ```mermaid ` blocks become `<pre class="mermaid">` inside a `.vis-mermaid-wrap`, with
the [Mermaid module block](#mermaid-for-graph-shaped-content) added so they render.
Carry the content across faithfully; you are typesetting it, not summarising it, and
diagram sources must be copied byte-for-byte or they will not parse.

Then plan the visualization:

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

Then author `$HTML_DIR/visualization.html` **with the Write tool**, directly at
the destination path — see `references/serve.md` — "Authoring files into the temp
directory".

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
| Dependency graph, call flow, sequence, state machine | [Mermaid](#mermaid-for-graph-shaped-content) |
| Before/after structural comparison | [Mermaid pair](#beforeafter-pairs), side by side |
| Hierarchy or graph with few nodes (< ~30) | Inline SVG, or Mermaid if the edges matter more than the layout |
| Quantitative comparison (bar, line, scatter) | Inline SVG or a CDN chart library |
| Tabular data | HTML `<table>` with `<thead>`/`<tbody>` |
| Architecture diagram with a deliberate visual point | Inline SVG (see [editorial diagrams](#editorial-diagrams-hand-built)) |
| Text-heavy summary | Semantic HTML (`<dl>`, `<ul>`, `<section>`) |
| Interactive / animated (timeline, treemap, force graph) | CDN chart library |

**Rule of thumb**: if the content is *edges between named things*, reach for Mermaid —
laying that out by hand in SVG is wasted effort. If the content is a *visual argument*
(this box is thick, that one is hollow, six layers collapse into one), hand-build it;
Mermaid will fight you and the result will look like every other flowchart.

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

### Mermaid (for graph-shaped content)

Mermaid is the right tool whenever the content is **edges between named things** —
dependency graphs, call flow, sequences, state machines. Write the diagram as text
and let it lay itself out; do not hand-place nodes in SVG for this.

Mermaid does **not** read the page's CSS custom properties. Left alone it renders its
own palette, which will clash with the template in one scheme and be unreadable in the
other. So it must be wired to the `--hv-*` tokens explicitly, and re-rendered when the
colour scheme flips. Use this block verbatim — it is the whole integration:

```html
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

  const hv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  const blocks = [...document.querySelectorAll("pre.mermaid")];
  blocks.forEach(b => { b.dataset.src = b.textContent; });

  async function render() {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        background:       hv("--hv-surface"),
        primaryColor:     hv("--hv-surface-2"),
        primaryTextColor: hv("--hv-text"),
        primaryBorderColor: hv("--hv-border"),
        lineColor:        hv("--hv-muted"),
        secondaryColor:   hv("--hv-accent-tint"),
        tertiaryColor:    hv("--hv-surface"),
        fontFamily:       hv("--hv-font-body"),
      },
    });
    // Restore the source and clear Mermaid's processed marker so a re-render works.
    // textContent, NOT innerHTML — the source was captured as text, and re-parsing it as
    // HTML mangles any diagram containing "<": stateDiagram's <<choice>>/<<fork>>, or an
    // edge label like |"n < 10"|. First render would look fine; the theme flip breaks it.
    blocks.forEach(b => { b.textContent = b.dataset.src; b.removeAttribute("data-processed"); });
    await mermaid.run({ nodes: blocks });
  }

  render();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
</script>
```

Each diagram is a `<pre class="mermaid">` inside a `.vis-mermaid-wrap`. Keep the
diagram source indented consistently — Mermaid is whitespace-sensitive:

```html
<div class="vis-mermaid-wrap">
  <pre class="mermaid">
flowchart LR
  A[OrderHandler] --> B[OrderValidator]
  B --> C[OrderRepo]
  C -.->|leaks| D[PricingClient]
  classDef leak stroke-width:2px,stroke-dasharray:4 4;
  class C,D leak
  </pre>
</div>
```

**Never put a CSS function inside `classDef`.** Mermaid parses the declaration itself, so
`classDef leak stroke:var(--hv-bad)` is a hard parse error on the `(` — the entire diagram
fails to render, not just the colour. A literal hex parses, but bakes one scheme's colour
into a page that flips themes.

Split the two concerns instead: `classDef` carries **structure** (`stroke-width`,
`stroke-dasharray`), and **CSS carries the colour**, targeting the class Mermaid stamps onto
the node:

```css
.vis-mermaid-wrap .leak > rect,
.vis-mermaid-wrap .leak > polygon,
.vis-mermaid-wrap .leak > path { stroke: var(--hv-bad) !important; }
```

That follows the theme for free, being an ordinary token reference. `!important` is required
— Mermaid writes its own stroke inline.

#### Before/after pairs

A structural change reads best as two diagrams side by side, not one annotated diagram.
Wrap the pair in `.vis-compare` (see the template) so they sit in two columns on a wide
screen and stack on a narrow one, and give each half a `.vis-mermaid-label` reading
**Before** / **After** above its `.vis-mermaid-wrap`:

```html
<div class="vis-compare">
  <div class="vis-mermaid-wrap">
    <span class="vis-mermaid-label">Before</span>
    <pre class="mermaid">…</pre>
  </div>
  <div class="vis-mermaid-wrap">
    <span class="vis-mermaid-label">After</span>
    <pre class="mermaid">…</pre>
  </div>
</div>
```

Keep node names identical across the pair so the eye can track what moved, and keep each
diagram under roughly a dozen nodes — past that the comparison stops being readable and
you should show only the part that changes.

### Editorial diagrams (hand-built)

Some points are visual arguments rather than graphs, and Mermaid renders them limply.
Hand-build these in SVG or divs:

- **Mass diagram** — two stacked rectangles per module, one for interface surface and one
  for implementation. A tall interface on a thin implementation reads as *shallow* at a
  glance; a thin interface on a deep body reads as *deep*.
- **Cross-section** — horizontal bands stacked to show the layers a call passes through.
  Six thin bands collapsing into one thick band is the entire argument.
- **Call-graph collapse** — nested boxes before, one box with faded internals after.

Mixing these with Mermaid is deliberate. A page where every diagram is a Mermaid
flowchart looks generic and flattens the distinction between "these things are
connected" and "this thing is the wrong shape".

### Other CDN chart libraries

When inline SVG would be prohibitively verbose or the visualization needs interactivity
(zoom, tooltip, animation):

| Library | CDN snippet | Best for |
|---|---|---|
| Chart.js | `<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>` | Bar, line, pie, doughnut |
| D3.js | `<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>` | Force graph, treemap, custom |

Add the `<script>` tag to `<head>` and initialise in an inline `<script>` at the bottom
of `<body>`. These two are UMD globals — no `import` needed. (Mermaid is the exception:
it is an ESM `import`, per the block above.)

> **Tradeoff**: anything from a CDN needs the network on **first** load. What happens to a
> saved copy differs by library, because **Save** clones the live DOM:
>
> - **Mermaid survives.** By the time the user clicks Save the diagrams are already
>   rendered as inline `<svg>`, and the clone keeps both that markup and the
>   `data-processed` attribute — so the saved file renders offline. What it loses is the
>   theme-flip re-render: the module cannot re-import, so a saved page keeps whichever
>   scheme was active when it was saved.
> - **Chart.js and D3 do not.** They draw into a `<canvas>`, whose bitmap `cloneNode` does
>   not preserve, so a saved copy reopened offline shows an empty box.
>
> Inline SVG has no failure mode at all, so still prefer it when the diagram can be encoded
> statically and the graph is small enough to place by hand.

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
fills and strokes, prefer `currentColor` or `var(--hv-accent)`. Mermaid is the one
renderer that cannot see those tokens — it needs the `themeVariables` bridge and the
re-render listener from the [Mermaid section](#mermaid-for-graph-shaped-content). Two
distinct symptoms tell you which half is missing: **blank space** where a diagram should be
means the module block is absent entirely, so the FOUC guard
(`pre.mermaid:not([data-processed])`) never released it; a diagram that **renders but
clashes** — fine in one scheme, dark-on-dark in the other — means the module ran but
`themeVariables` was omitted, so Mermaid fell back to its own palette.

**Responsive visuals.** Keep `max-width: 900px; margin: 0 auto` on the content
container (already in the template). For SVGs, set `width="100%"` plus a
`viewBox`. Wrap wide tables in `<div style="overflow-x: auto">`.

---

## Step 3 — Start the server (Cycle B, non-blocking)

See `references/serve.md` — Cycle B (non-blocking serve-and-continue). Surface
the URL to the user as a markdown link with the message:

> Your visualization is ready → **[Open visualization](http://127.0.0.1:PORT/)**
>
> Open that link in your browser to view it. You can optionally type a message in
> the footer and click **Send** to share feedback or a follow-up request — or click
> **Save** to download a copy of the page.

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

## `file://` vs server

Always serve via the server, even when the page is fully self-contained and
would open correctly as a `file://` URL.

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
