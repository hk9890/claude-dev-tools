# html-visualization — Design Decisions

Non-derivable design decisions and constraints for this plugin. Read before making changes.

## 1. Core skill + three command skills around one shared server

`html-visualization` hosts a shared core skill, `html-visualize`, plus three thin
command skills that load it. The core renders interactive HTML, lets the user act
on it in a browser, and feeds the result back to Claude. It has three modes, one
per command skill:

- **ask** (`html-visualize-ask`) — renders a question/decision form; the user answers and submits.
- **feedback** (`html-visualize-feedback`) — renders content (e.g. a document) for inline commenting.
- **visualize** (`html-visualize-demo`) — renders a rich HTML page served non-blocking; an always-on footer lets the user optionally send a message back.

The core `html-visualize` skill holds all the logic (mode references, the shared
serve procedure, templates). Each command skill is a thin wrapper that fixes the
mode and loads the core — mirroring the `beads-core` + `beads-plan`/`beads-work`
pattern. All modes share `bin/server.js` (the one-shot Node server) and the CSRF,
temp-dir, and lifecycle rules below. Mode-specific browser assets live under
`assets/<mode>/`.

**A new mode belongs here only if it follows this round-trip shape: Claude authors
HTML → shared server serves it → user interacts → server captures one JSON submit →
Claude reads it back. A new mode means a new command skill plus a mode reference in
the core — do not add unrelated skills or modes.**

## 2. User-invoked command skills — the model cannot trigger them

The three command skills (`html-visualize-ask`, `html-visualize-feedback`,
`html-visualize-demo`) are `user-invocable: true` and `disable-model-invocation:
true` — only the user can invoke them, by slash command, and the free-text intent
travels in as the command argument. The core `html-visualize` skill is
`user-invocable: false`: it is never triggered directly, only loaded by a command
skill.

This is a deliberate reversal of the plugin's earlier "invoked when Claude
decides" design: the user prepares the intent and chooses the mode, so there is no
risk of an empty document with no content. The model must not auto-render
interactive HTML on its own judgement.

**Keep `disable-model-invocation: true` on every command skill and
`user-invocable: false` on the core. Do not give any skill in this plugin a
model-triggering description. Do not add a fourth invocation surface (e.g. a slash
command file) — the command skills are the invocation surface.**

## 3. (visualize mode) Always-on footer — no opt-out flag

Every visualize page has a "Message to Claude" footer with **Send** and **Save**
buttons. There is no `--no-footer` flag or per-invocation opt-out. The footer is
part of the template (`visualize-template.html`) and is always present.

- **Send** posts `{ "freeform": "<message>" }` to the server. A non-empty message
  causes the server to write a feedback file and exit 0, re-invoking Claude. An
  empty message causes the server to exit 0 silently — no file written.
- **Save** produces a clean, self-contained HTML download with the CSRF token
  stripped and Send disabled. This is the intended "keep this page offline" path.
  A saved copy opened as `file://` cannot reach the server, so Send is inert there.

**Do not add a `--no-footer` flag. Do not remove the footer from the template. Do
not suppress Send/Save for any particular visualization — the footer is always on.**

## 4. Zero-dependency Node server — no npm install step

`bin/server.js` uses only Node built-in modules (`http`, `fs`, `crypto`, `os`,
`path`). There is no `package.json`, no `node_modules`, and no install step. This
is a deliberate tradeoff: the server is always immediately runnable after plugin
install, at the cost of not using npm ecosystem libraries.

**Do not add npm dependencies. Do not add a `package.json` with external
dependencies. If a feature would require an npm package, find a built-in
equivalent or simplify the feature.** This also rules out shipping a markdown
parser — skills author semantic HTML directly.

## 5. One-shot server lifecycle — exit 0 after first successful submit

The server listens until the first successful `POST /submit`, writes the feedback
file, and then calls `exit 0`. It does not keep running. This is what triggers the
harness to re-invoke Claude with the feedback file path as context (verified
empirically on 2026-05-22 — see epic `claude-dev-tools-aa9` comment).

**Do not make the server persistent or restartable. Any change that prevents
`exit 0` after first submit breaks the round-trip.**

## 6. Schema-agnostic server — each mode owns its payload

`bin/server.js` does not know or validate any mode's payload shape. On `POST
/submit` it checks CSRF/Origin, requires `Content-Type: application/json`, requires
the body to parse as a JSON **object**, stamps `submittedAt`, and writes the object
verbatim. Field-level validation (verdict values, required keys, comment shape) is
each mode's own concern, enforced in that mode's `assets/<mode>/app.js` and
documented in that mode's `references/<mode>-submit-schema.md`.

**Do not move mode-specific field validation into the server. Keeping the server
schema-agnostic is what lets every current and future mode share it.**

## 7. Per-mode browser assets under `assets/<mode>/`

Browser assets are namespaced per mode: `assets/ask/{style.css,app.js}`,
`assets/feedback/{style.css,app.js}`, plus a cross-mode `assets/shared/tokens.css`
design-token layer that the per-mode stylesheets and the visualize template import.
The server serves them at `/assets/<mode>/…` (and `/assets/shared/…`). A mode's
authored HTML references only its own subdirectory plus the shared tokens. (The
`visualize` mode is self-contained in its template and requires no
`assets/visualize/` directory.)

**Do not put one mode's CSS/JS in another mode's directory. The only shared
location is `assets/shared/`, reserved for genuinely cross-mode tokens; when adding
a mode that needs its own browser assets, create a new `assets/<mode>/`
subdirectory.**

## 8. Temp-dir ephemerality — no persisted session files

All per-invocation files (HTML document, feedback JSON, the feedback-mode `.port`
file) are written to a unique subdirectory of the system temp dir
(`os.tmpdir()`). These files are ephemeral: not committed, not archived, not
reused across invocations. Each new skill invocation creates a fresh temp
subdirectory.

One clarification for the feedback-mode Apply loop (see rule 13): an Apply loop
is a **single skill invocation that spans multiple server cycles**. The temp dir
belongs to the invocation, not to one server cycle — it is created once and
reused across every Apply round, and deleted only after the final Submit. That
is reuse *within* one invocation, not across invocations.

**Do not write files outside the per-invocation temp dir. Do not reuse a temp dir
across separate invocations. Do not commit or preserve feedback JSON files.**

## 9. Startup-token CSRF protection — token + Origin/Sec-Fetch-Site

The server binds `127.0.0.1` only, but the localhost bind is NOT a CSRF boundary.
The primary CSRF defence is a per-invocation cryptographically random startup token
(at least 128 bits). The token is embedded in the served HTML as
`const CSRF_TOKEN = "..."` and checked on every `POST /submit` via the
`X-CSRF-Token` header. Secondary defence: `Origin` and `Sec-Fetch-Site` validation.

The full contract — token format, embedding location, header name, allowed
Origin/Sec-Fetch-Site values, response codes — is defined in each mode's
`references/<mode>-submit-schema.md`; the CSRF section is identical across modes
because it is server behaviour.

**Do not weaken CSRF protection. Do not accept the token as a query parameter or
in the JSON body — it must be a request header so it is not logged in browser
history. Do not relax the token to a short/guessable value.**

## 10. (ask mode) Partial feedback is always accepted — verdict is optional

The ask-mode form never blocks submission. The user may submit with the verdict or
any individual question left unanswered. The browser-side submit handler does not
require a verdict, and an empty `verdict: ""` is a valid payload. This is
deliberate: the round-trip must never trap the user because they had no opinion on
every question. Claude is responsible — per the skill's read-back step — for
reporting which items were left unanswered.

**Do not reintroduce a client-side check that blocks submit on an empty verdict or
on unanswered questions.**

## 11. (ask mode) Every choice-style question carries an always-visible note field

Each `radio`, `checkbox`, and `approaches` widget is marked `.annotatable`, and
`assets/ask/app.js` injects an always-visible free-text note `<textarea>` into it.
This guarantees the user can write free text on any question, not only pick from
fixed options. Notes travel in the `comments` array of the submit payload, anchored
by `#<data-qid>`. `text` widgets are NOT annotatable — their own `<textarea>`
already is the free-text field.

**Do not hide the note field behind a button or make it opt-in — "always visible"
is the point. Do not add a second per-widget free-text mechanism alongside it.**

## 12. (feedback mode) Block-anchored comments — no fragile text offsets

In feedback mode, every commentable unit of content is an element carrying a stable
`data-block-id`. Commenting is selection-driven — the user selects text and a
floating button appears — but the stored anchor is the block id, never a character
offset range. The selected text is captured as a verbatim `quote` string; the
anchor is still the block. Each comment also carries the block's text
(`blockText`) so Claude's read-back is self-contained and does not require
re-parsing the authored HTML. The inline `<mark>` highlight of a quoted phrase is
best-effort (it is skipped when the selection crosses element boundaries) — the
comment is never lost when the highlight cannot be drawn.

**Do not switch feedback mode to character-offset anchoring — it breaks when
content reflows. Keep `data-block-id` as the anchor.**

## 13. (feedback mode) The Apply loop — iterate without breaking the one-shot server

Feedback mode has two submit actions. **Submit** ends the round-trip. **Apply**
is iterative: the page POSTs `action: "apply"`, the server still exits 0 (rule 5
holds), Claude applies the feedback, regenerates `review.html` in the same temp
dir with a fresh `fb-generation` value, and re-serves it on the **same port**
(captured into `.port` on the first serve). The served page polls `GET /` and
reloads itself when it sees a changed `fb-generation`, so the user keeps one URL
and one browser tab across the whole loop. Final **Submit** does not re-serve.

**Do not make Apply keep the server alive — each round is still one-shot. Do not
let the re-serve pick a new random port (the open tab polls the old one). Do not
reuse an `fb-generation` value — a stale value means the page never reloads.**
