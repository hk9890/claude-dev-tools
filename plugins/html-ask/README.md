# html-ask

Interactive in-browser feedback for multi-decision plans and question batches.

## What it does

When Claude is about to present a plan with several decisions to confirm, or a batch of questions that benefit from a richer answer interface, the `html-ask` skill converts that content into an interactive HTML document, opens it in the user's default browser, and waits for the user to fill in answers and submit.

The round-trip:

1. **Claude authors the form.** Using the documented markup vocabulary (see aa9.3 asset kit), Claude writes a complete HTML document with a question set, a verdict selector, and a free-text comments area.
2. **The skill launches the server.** A zero-dependency Node server serves the HTML document and shared CSS/JS assets from a unique per-invocation temp directory.
3. **The user answers in-browser.** The page is opened automatically. The user completes the form and clicks Submit.
4. **The server writes feedback and exits.** On the first successful POST to `/submit`, the server writes a `feedback.json` file to the same temp directory, then exits with code 0. This triggers the harness to re-invoke Claude.
5. **Claude reads the feedback and continues.** The re-invocation carries the feedback file path; Claude reads it and proceeds based on the user's answers, verdict, and comments.

## Runtime requirements

- **Node.js** — any current LTS release (18+). The server uses only built-in modules (no npm install needed).
- A browser that can open `http://127.0.0.1:<port>` (any modern desktop browser).

## Skills

| Skill | Invocation | Description |
|---|---|---|
| `html-ask` | `html-ask:html-ask` | Author and serve an interactive HTML feedback form, then read the user's response |

The skill is invoked by Claude when appropriate, not by the user typing a command.

## Plugin structure

```
html-ask/
├── .claude-plugin/
│   └── plugin.json
├── RULES.md
├── README.md
├── assets/               # shared CSS, JS served by the Node server
├── bin/                  # server.js — zero-dependency Node feedback server
└── skills/
    └── html-ask/
        ├── SKILL.md
        └── references/
            └── submit-schema.md   # single source of truth for POST /submit contract
```

## Security

The server binds `127.0.0.1` only. CSRF protection is a per-invocation unguessable startup token embedded in the served HTML. See `skills/html-ask/references/submit-schema.md` for the full security contract.
