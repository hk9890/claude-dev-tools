# Mermaid diagrams

The Mermaid integration, shared by every mode that draws a graph. `visualize.md`
and `ask.md` both point here; this file is the single source of truth for the
module block, the markup, and the colour rules.

Mermaid is the right tool whenever the content is **edges between named things** —
dependency graphs, call flow, sequences, state machines. Write the diagram as text
and let it lay itself out; do not hand-place nodes in SVG for this.

---

## The module block

Mermaid does **not** read the page's CSS custom properties. Left alone it renders its
own palette, which will clash with the page in one scheme and be unreadable in the
other. So it must be wired to the `--hv-*` tokens explicitly, and re-rendered when the
colour scheme flips. Add this block once per page, before `</body>`. Use it verbatim —
it is the whole integration:

```html
<script type="module">
  const hv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  const blocks = [...document.querySelectorAll("pre.mermaid")];
  blocks.forEach(b => { b.dataset.src = b.textContent; });

  // The FOUC guard hides the source until Mermaid marks it processed. If Mermaid never
  // arrives, that guard would leave an empty bordered box with no explanation — so
  // reveal the source instead. A wall of syntax beats a silent blank.
  const reveal = () => blocks.forEach(b => { b.style.visibility = "visible"; });

  // Dynamic import, not a static one: a static `import` that fails aborts the whole
  // module, so no catch inside it would ever run and the guard could never release.
  let mermaid;
  try {
    mermaid = (await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs")).default;
  } catch (e) {
    reveal();
    throw e;
  }

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

  render().catch(reveal);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
</script>
```

The import reaches a CDN, so a diagram needs network access. The guard above degrades
to showing the diagram source when that fails — readable, if ugly. Let the prose carry
the point on its own, so a page whose diagrams never render is still answerable.

### What each symptom means

- **Raw Mermaid syntax on the page** — Mermaid never arrived: the CDN is unreachable or
  CSP-blocked. The `reveal()` fallback released the FOUC guard on purpose, so the source
  shows rather than an empty box.
- **Blank space inside a bordered box** — the module block is missing entirely, so nothing
  ever released `pre.mermaid:not([data-processed])`. If you copied the block, check it is a
  `<script type="module">` and not a plain `<script>`.
- **Renders but clashes** — fine in one scheme, dark-on-dark in the other. The module ran
  but `themeVariables` was omitted, so Mermaid used its own palette.

A malformed diagram is a separate case and is **contained**: `mermaid.run` renders an error
graphic in that one block and the other diagrams on the page still render.

---

## Markup

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

`.vis-mermaid-wrap`, `.vis-mermaid-label` and `.vis-compare` are already styled in
every mode that points here — `assets/ask/style.css` for ask mode, the inline
`<style>` block for visualize mode's self-contained template. Do not restyle them.

---

## Colour

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

---

## Before/after pairs

A structural change reads best as two diagrams side by side, not one annotated diagram.
Wrap the pair in `.vis-compare` so they sit in two columns on a wide screen and stack on a
narrow one, and give each half a `.vis-mermaid-label` reading **Before** / **After**:

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
