# html-visualization

Interactive HTML the user opens in a browser, then sends back to Claude.

## Overview

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

A shared core skill holds all the logic; three thin command skills load it, one
per mode. The command skills are **user-invoked only** — the model cannot trigger
them. The free-text intent travels in as the slash-command argument.

| Skill | Invocation | Role |
|---|---|---|
| `html-visualize` | — (loaded by the commands) | Core: mode references, shared serve procedure, templates. `user-invocable: false`. |
| `html-visualize-ask` | `/html-visualization:html-visualize-ask` | **ask** — question/decision form (text, single/multi choice, approach widgets, overall verdict). |
| `html-visualize-feedback` | `/html-visualization:html-visualize-feedback` | **feedback** — content for inline commenting (user selects text, attaches comment, iterates with Apply). |
| `html-visualize-demo` | `/html-visualization:html-visualize-demo` | **visualize** — HTML page served non-blocking; always-on footer lets the user optionally send a message back. |

Rule of thumb: **ask mode asks the user questions; feedback mode shows the user
content to react to; visualize mode renders content and continues immediately —
the user may optionally send a follow-up message via the footer.** Each command
skill is `disable-model-invocation: true` — only the user invokes them, by slash
command.

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
│   ├── shared/               # cross-mode design tokens (tokens.css)
│   ├── ask/                  # CSS + JS for ask-mode pages
│   └── feedback/             # CSS + JS for feedback-mode pages
└── skills/
    ├── html-visualize/          # core: logic, references, templates
    │   ├── SKILL.md
    │   └── references/          # ask.md, feedback.md, visualize.md, serve.md,
    │                            # *-markup.md, *-submit-schema.md, *-template.html
    ├── html-visualize-ask/      # command skill → ask mode
    │   └── SKILL.md
    ├── html-visualize-feedback/ # command skill → feedback mode
    │   └── SKILL.md
    └── html-visualize-demo/     # command skill → visualize mode
        └── SKILL.md
```

The server is **shared and schema-agnostic** — it handles transport, CSRF, the
one-shot lifecycle, and the atomic write, but knows nothing about any mode's
payload shape. Each mode owns its own markup contract, browser assets, and
`/submit` payload schema. See [RULES.md](RULES.md) for the full set of design
decisions.

## Security

The server binds `127.0.0.1` only. CSRF protection is a per-invocation unguessable
startup token embedded in the served HTML and required as the `X-CSRF-Token`
header on `POST /submit`, with `Origin`/`Sec-Fetch-Site` as a secondary check.
Each mode's `references/<mode>-submit-schema.md` documents the full contract.
