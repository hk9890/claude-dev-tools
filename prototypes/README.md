# html-visualize improvement prototypes

Interactive HTML prototypes for the planned html-visualization plugin improvements.
Reference material for the implementation PR — not shipped plugin code; nothing here
is served or loaded by any skill.

Task: claudedevt-cr8w9l. Builds on the direction of PR #69.

## Viewing

```bash
python3 -m http.server 8917 --bind 0.0.0.0 --directory prototypes
# open http://<hostname>:8917/
```

Append `?demo` to either page to pre-seed example comments/references.
Diagrams need the Mermaid CDN once; everything else is self-contained.

## Pages

- `feedback.html` — element-level feedback: every comment carries a
  `target` with a `kind` (`quote` | `block` | `element` | `diagram-node`).
  Text selection down to a single word, pick-element mode for list items /
  table rows / code lines, clickable Mermaid nodes resolving to source node
  ids, margin comment rail with numbered pins, payload drawer showing the
  exact `/submit` JSON. The reviewed document is the proposal itself.
- `visualize.html` — redesigned visualize mode: sticky TOC with scrollspy,
  stat tiles, bar chart per the dataviz mark specs, collapsible line-numbered
  code, and a "Point at" footer that turns bars / rows / tiles / diagram
  nodes into structured reference chips sent with the message.
- `index.html` — links both with a summary of what to try.

Theme sketch "Proof": chrome is a sans-serif instrument, content a serif
artifact, everything the user adds is pencil blue. Light + dark; responsive
from 360px up to a 3-column wide-screen layout (>=1400px).

## Testing

Verified with Playwright (resolved from the npm _npx cache, as in
`tests/html-visualization/script-tests/test-browser.js`): 58 interaction
assertions (selection, pick mode, diagram-node targeting, rail edit/delete,
payload shape, Esc handling, dark-mode re-render survival) and 35 responsive
checks (no horizontal overflow at 360-1440px, footer fit, rail breakpoint,
chart track width). Test scripts lived in the session scratchpad; port them
into `tests/` if these prototypes graduate into the plugin.
