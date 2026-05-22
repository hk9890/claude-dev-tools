# html-visualization

Interactive HTML the user opens in a browser, then sends back to Claude.

## What it does

Some exchanges are easier in a browser than in a chat window. This plugin is a
family of skills that follow the same round-trip: Claude authors an HTML page, a
zero-dependency Node server serves it locally, the user interacts with it, and the
server captures one JSON response and re-invokes Claude with it.

The round-trip:

1. **Claude authors the HTML.** Using the skill's documented markup vocabulary,
   Claude writes a complete HTML document into a per-invocation temp directory.
2. **The skill launches the server.** `bin/server.js` serves the document and the
   skill's CSS/JS assets, binding `127.0.0.1` on a random port.
3. **The user interacts in-browser.** They answer, comment, and submit.
4. **The server writes the response and exits.** On the first successful POST to
   `/submit`, the server writes a `*.feedback.json` file next to the HTML, then
   exits with code 0 — which re-invokes Claude.
5. **Claude reads the response and continues.**

## Skills

| Skill | Invocation | What it renders |
|---|---|---|
| `html-ask` | `html-visualization:html-ask` | A **question/decision form** — text, single/multi choice, and side-by-side approach widgets, plus an overall verdict. Use when Claude needs structured answers before proceeding. |
| `html-feedback` | `html-visualization:html-feedback` | **Content for inline commenting** — Claude renders a document, draft, or notes; the user hovers any block, optionally selects a phrase, and attaches a free-text comment. Use when the user wants to mark up content for Claude to revise. |

Rule of thumb: **html-ask asks the user questions; html-feedback shows the user
content to react to.** Both skills are invoked by Claude when appropriate, not by
the user typing a command.

## Runtime requirements

- **Node.js** — any current LTS release (18+). The server uses only built-in
  modules; there is no `npm install` step.
- A browser that can open `http://127.0.0.1:<port>` (any modern desktop browser).

## Plugin structure

```
html-visualization/
├── .claude-plugin/
│   └── plugin.json
├── RULES.md                  # design decisions — read before changing anything
├── README.md
├── bin/
│   └── server.js             # shared zero-dependency one-shot feedback server
├── assets/
│   ├── ask/                  # CSS + JS for html-ask pages
│   └── feedback/             # CSS + JS for html-feedback pages
└── skills/
    ├── html-ask/
    │   ├── SKILL.md
    │   └── references/       # markup.md, submit-schema.md, template.html
    └── html-feedback/
        ├── SKILL.md
        └── references/       # markup.md, submit-schema.md, template.html
```

The server is **shared and schema-agnostic** — it handles transport, CSRF, the
one-shot lifecycle, and the atomic write, but knows nothing about any skill's
payload shape. Each skill owns its own markup contract, browser assets, and
`/submit` payload schema. See [RULES.md](RULES.md) for the full set of design
decisions.

## Security

The server binds `127.0.0.1` only. CSRF protection is a per-invocation unguessable
startup token embedded in the served HTML and required as the `X-CSRF-Token`
header on `POST /submit`, with `Origin`/`Sec-Fetch-Site` as a secondary check.
Each skill's `references/submit-schema.md` documents the full contract.
