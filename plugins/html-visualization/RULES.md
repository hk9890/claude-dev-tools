# html-visualization — Design Decisions

Non-derivable design decisions and constraints for this plugin. Read before making changes.

## 1. Multi-skill plugin around one shared server

`html-visualization` hosts a family of skills that render interactive HTML, let
the user act on it in a browser, and feed the result back to Claude. Today:

- **`html-ask`** — renders a question/decision form; the user answers and submits.
- **`html-feedback`** — renders content (e.g. a document) for inline commenting.

All skills share `bin/server.js` (the one-shot Node server) and the CSRF, temp-dir,
and lifecycle rules below. Skill-specific browser assets live under `assets/<skill>/`.

**A new skill belongs here only if it follows this round-trip shape: Claude authors
HTML → shared server serves it → user interacts → server captures one JSON submit →
Claude reads it back. Do not add unrelated skills.**

## 2. Skill-only — no slash commands

Every skill in this plugin is invoked when Claude decides the content warrants an
interactive document, not by the user typing a command. A slash command would let
a user invoke an empty document with no content prepared, which is meaningless.

**Do not add slash commands to this plugin.**

## 3. Zero-dependency Node server — no npm install step

`bin/server.js` uses only Node built-in modules (`http`, `fs`, `crypto`, `os`,
`path`). There is no `package.json`, no `node_modules`, and no install step. This
is a deliberate tradeoff: the server is always immediately runnable after plugin
install, at the cost of not using npm ecosystem libraries.

**Do not add npm dependencies. Do not add a `package.json` with external
dependencies. If a feature would require an npm package, find a built-in
equivalent or simplify the feature.** This also rules out shipping a markdown
parser — skills author semantic HTML directly.

## 4. One-shot server lifecycle — exit 0 after first successful submit

The server listens until the first successful `POST /submit`, writes the feedback
file, and then calls `exit 0`. It does not keep running. This is what triggers the
harness to re-invoke Claude with the feedback file path as context (verified
empirically on 2026-05-22 — see epic `claude-dev-tools-aa9` comment).

**Do not make the server persistent or restartable. Any change that prevents
`exit 0` after first submit breaks the round-trip.**

## 5. Schema-agnostic server — each skill owns its payload

`bin/server.js` does not know or validate any skill's payload shape. On `POST
/submit` it checks CSRF/Origin, requires `Content-Type: application/json`, requires
the body to parse as a JSON **object**, stamps `submittedAt`, and writes the object
verbatim. Field-level validation (verdict values, required keys, comment shape) is
each skill's own concern, enforced in that skill's `assets/<skill>/app.js` and
documented in that skill's `references/submit-schema.md`.

**Do not move skill-specific field validation into the server. Keeping the server
schema-agnostic is what lets every current and future skill share it.**

## 6. Per-skill browser assets under `assets/<skill>/`

Browser assets are namespaced per skill: `assets/ask/{style.css,app.js}`,
`assets/feedback/{style.css,app.js}`. The server serves them at `/assets/<skill>/…`.
A skill's authored HTML references only its own subdirectory.

**Do not put one skill's CSS/JS in another skill's directory or at the `assets/`
root. When adding a skill, create a new `assets/<skill>/` subdirectory.**

## 7. Temp-dir ephemerality — no persisted session files

All per-invocation files (HTML document, feedback JSON, the html-feedback `.port`
file) are written to a unique subdirectory of the system temp dir
(`os.tmpdir()`). These files are ephemeral: not committed, not archived, not
reused across invocations. Each new skill invocation creates a fresh temp
subdirectory.

One clarification for the html-feedback Apply loop (see rule 12): an Apply loop
is a **single skill invocation that spans multiple server cycles**. The temp dir
belongs to the invocation, not to one server cycle — it is created once and
reused across every Apply round, and deleted only after the final Submit. That
is reuse *within* one invocation, not across invocations.

**Do not write files outside the per-invocation temp dir. Do not reuse a temp dir
across separate invocations. Do not commit or preserve feedback JSON files.**

## 8. Startup-token CSRF protection — token + Origin/Sec-Fetch-Site

The server binds `127.0.0.1` only, but the localhost bind is NOT a CSRF boundary.
The primary CSRF defence is a per-invocation cryptographically random startup token
(at least 128 bits). The token is embedded in the served HTML as
`const CSRF_TOKEN = "..."` and checked on every `POST /submit` via the
`X-CSRF-Token` header. Secondary defence: `Origin` and `Sec-Fetch-Site` validation.

The full contract — token format, embedding location, header name, allowed
Origin/Sec-Fetch-Site values, response codes — is defined in each skill's
`references/submit-schema.md`; the CSRF section is identical across skills because
it is server behaviour.

**Do not weaken CSRF protection. Do not accept the token as a query parameter or
in the JSON body — it must be a request header so it is not logged in browser
history. Do not relax the token to a short/guessable value.**

## 9. (html-ask) Partial feedback is always accepted — verdict is optional

The html-ask form never blocks submission. The user may submit with the verdict or
any individual question left unanswered. The browser-side submit handler does not
require a verdict, and an empty `verdict: ""` is a valid payload. This is
deliberate: the round-trip must never trap the user because they had no opinion on
every question. Claude is responsible — per the skill's read-back step — for
reporting which items were left unanswered.

**Do not reintroduce a client-side check that blocks submit on an empty verdict or
on unanswered questions.**

## 10. (html-ask) Every choice-style question carries an always-visible note field

Each `radio`, `checkbox`, and `approaches` widget is marked `.annotatable`, and
`assets/ask/app.js` injects an always-visible free-text note `<textarea>` into it.
This guarantees the user can write free text on any question, not only pick from
fixed options. Notes travel in the `comments` array of the submit payload, anchored
by `#<data-qid>`. `text` widgets are NOT annotatable — their own `<textarea>`
already is the free-text field.

**Do not hide the note field behind a button or make it opt-in — "always visible"
is the point. Do not add a second per-widget free-text mechanism alongside it.**

## 11. (html-feedback) Block-anchored comments — no fragile text offsets

In html-feedback, every commentable unit of content is an element carrying a stable
`data-block-id`. Commenting is selection-driven — the user selects text and a
floating button appears — but the stored anchor is the block id, never a character
offset range. The selected text is captured as a verbatim `quote` string; the
anchor is still the block. Each comment also carries the block's text
(`blockText`) so Claude's read-back is self-contained and does not require
re-parsing the authored HTML. The inline `<mark>` highlight of a quoted phrase is
best-effort (it is skipped when the selection crosses element boundaries) — the
comment is never lost when the highlight cannot be drawn.

**Do not switch html-feedback to character-offset anchoring — it breaks when
content reflows. Keep `data-block-id` as the anchor.**

## 12. (html-feedback) The Apply loop — iterate without breaking the one-shot server

html-feedback has two submit actions. **Submit** ends the round-trip. **Apply**
is iterative: the page POSTs `action: "apply"`, the server still exits 0 (rule 4
holds), Claude applies the feedback, regenerates `review.html` in the same temp
dir with a fresh `fb-generation` value, and re-serves it on the **same port**
(captured into `.port` on the first serve). The served page polls `GET /` and
reloads itself when it sees a changed `fb-generation`, so the user keeps one URL
and one browser tab across the whole loop. Final **Submit** does not re-serve.

**Do not make Apply keep the server alive — each round is still one-shot. Do not
let the re-serve pick a new random port (the open tab polls the old one). Do not
reuse an `fb-generation` value — a stale value means the page never reloads.**
