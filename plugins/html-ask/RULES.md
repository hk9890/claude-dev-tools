# html-ask — Design Decisions

Non-derivable design decisions and constraints for this plugin. Read before making changes.

## 1. Skill-only — no slash command

`html-ask` is a skill, not a slash command. It is invoked when Claude decides the content warrants an interactive form, not by the user typing a command. Adding a slash command would let users invoke an empty form with no questions prepared, which is meaningless.

**Do not add a slash command to this plugin.**

## 2. Zero-dependency Node server — no npm install step

The feedback server (`bin/server.js`) uses only Node built-in modules (`http`, `fs`, `crypto`, `os`, `path`). There is no `package.json`, no `node_modules`, and no install step. This is a deliberate tradeoff: the server is always immediately runnable after plugin install, at the cost of not using npm ecosystem libraries.

**Do not add npm dependencies. Do not add a `package.json` with external dependencies. If a feature would require an npm package, find a built-in equivalent or simplify the feature.**

## 3. One-shot server lifecycle — exit 0 after first successful submit

The server listens until the first successful `POST /submit`, writes the feedback file, and then calls `exit 0`. It does not keep running. This is what triggers the harness to re-invoke Claude with the feedback file path as context (verified empirically on 2026-05-22 — see epic `claude-dev-tools-aa9` comment).

**Do not make the server persistent or restartable. Any change that prevents `exit 0` after first submit breaks the round-trip.**

## 4. Temp-dir ephemerality — no persisted session files

All per-invocation files (HTML document, assets symlinks, feedback JSON) are written to a unique subdirectory of the system temp dir (`os.tmpdir()`). These files are ephemeral: they are not committed, not archived, and not reused across invocations. Each new skill invocation creates a fresh temp subdirectory.

**Do not write files outside the per-invocation temp dir. Do not reuse temp dirs across invocations. Do not commit or preserve feedback JSON files.**

## 5. Startup-token CSRF protection — token + Origin/Sec-Fetch-Site

The server binds `127.0.0.1` only, but the localhost bind is NOT a CSRF boundary. The primary CSRF defence is a per-invocation cryptographically random startup token (at least 128 bits). The token is embedded in the served HTML as `const CSRF_TOKEN = "..."` and checked on every `POST /submit` via the `X-CSRF-Token` header. Secondary defence: `Origin` and `Sec-Fetch-Site` header validation.

The full contract — token format, embedding location, header name, allowed Origin/Sec-Fetch-Site values, response codes — is defined in `skills/html-ask/references/submit-schema.md`. That file is the single source of truth.

**Do not weaken CSRF protection. Do not accept the token as a query parameter or in the JSON body — it must be a request header so it is not logged in browser history. Do not relax the token to a short/guessable value.**

## 6. Partial feedback is always accepted — verdict is optional

The feedback form never blocks submission. The user may submit with the verdict or any individual question left unanswered. The browser-side submit handler does not require a verdict, and the server accepts `verdict: ""`. This is deliberate: the round-trip must never trap the user because they had no opinion on every question. Claude is responsible — per the skill's Step 4 read-back — for reporting which items were left unanswered.

**Do not reintroduce a client-side or server-side check that blocks submit on an empty verdict or on unanswered questions. The server still rejects a _non-empty_ verdict outside the three allowed values with `400`.**

## 7. Every choice-style question carries an always-visible note field

Each `radio`, `checkbox`, and `approaches` widget is marked `.annotatable`, and `app.js` injects an always-visible free-text note `<textarea>` into it. This guarantees the user can write free text on any question, not only pick from fixed options. Notes travel in the `comments` array of the submit payload, anchored by `#<data-qid>`. `text` widgets are NOT annotatable — their own `<textarea>` already is the free-text field.

**Do not hide the note field behind a button or make it opt-in — "always visible" is the point. Do not add a second per-widget free-text mechanism alongside it.**
