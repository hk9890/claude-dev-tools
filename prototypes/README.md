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
- `ask.html` — improved ask mode: progress dots and a wide-screen question
  index with answered state, a plain-English "Explain this decision"
  disclosure on every question, three new widget kinds (comparison cards
  with pros/cons, 1–5 scale, arrow-button ranking) alongside
  radio/checkbox/text, an architecture-change widget with Before/After
  Mermaid diagrams and an agree/disagree answer, anchored comments beyond
  the plain note (select text → quote, 💬 on an option row → option,
  click a diagram node → diagram-node), compact per-question notes, and a
  submit flow that flags unanswered questions with jump links instead of
  blocking. `answers` extends per kind (cards → chosen id, scale → number,
  rank → ordered array); anchored comments carry a `target` alongside the
  `anchor`. The form content is the real decision batch for the
  implementation PR.
- `index.html` — links all pages with a summary of what to try.

Theme sketch "Proof": chrome is a sans-serif instrument, content a serif
artifact, everything the user adds is pencil blue. Light + dark; responsive
from 360px up to a 3-column wide-screen layout (>=1400px).

## Testing

Playwright suites live in `tests/` next to the pages (playwright resolved
from the npm _npx cache, as in
`tests/html-visualization/script-tests/test-browser.js`; they exit 77 /
skip when it is absent). Serve the pages, then:

```bash
node prototypes/tests/proto-test.js   # feedback + visualize interactions (58 assertions)
node prototypes/tests/ask-test.js     # ask interactions (54 assertions)
node prototypes/tests/size-test.js    # responsive checks, 360-1440px, all pages (40)
```

`PROTO_BASE` overrides the default `http://127.0.0.1:8917`. These are
prototype-scoped and invisible to `tests/run-all.sh` (which only discovers
`test-*.sh` under the top-level `tests/`); graduate them into that harness
alongside the implementation PR.
