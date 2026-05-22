# visualize-mode `/submit` Payload Schema

Single source of truth for the POST `/submit` payload produced by the visualize-mode
footer (`visualize-template.html` inline script) and read back by Claude on
re-invocation.

The shared `bin/server.js` is **schema-agnostic** — it accepts any JSON object,
stamps `submittedAt`, and writes it verbatim. It does not validate the fields
below. Conforming to this schema is the responsibility of the inline footer script
(which emits it) and Claude (which reads it back). The server's only hard guarantees
are CSRF/Origin checks, an `application/json` Content-Type, a JSON-object body, and
the one-shot lifecycle.

## Wire format

- **Method**: `POST`
- **Path**: `/submit`
- **Content-Type**: `application/json`
- **Required header**: `X-CSRF-Token: <startup-token>` (see CSRF section below)

## Request body

```json
{
  "freeform": "<string>"
}
```

### Field definitions

| Field | Type | Required | Description |
|---|---|---|---|
| `freeform` | string | yes | The user's free-text message. MUST be present; MAY be an empty string `""`. |

The footer script always emits `freeform`. An empty string (`""`) means the user
clicked Send without typing anything — the server treats this as a silent close (no
feedback file written, exits 0). A non-empty string causes the server to write the
feedback file and exit 0, re-invoking Claude.

---

## Server behaviour — three outcomes, all exit 0

| Condition | Server action |
|---|---|
| `freeform` is a non-empty string | Writes `<basename>.feedback.json`, exits 0 → harness re-invokes Claude |
| `freeform` is `""` or missing | Exits 0 silently — no feedback file written, Claude not re-invoked |
| Timeout (default 1800 s) with no submit | Exits 0 silently — no feedback file written, Claude not re-invoked |

"Non-empty" is checked on the raw string value; trimming is the UI's responsibility.

---

## CSRF protection

Identical to every skill in this plugin — it is server behaviour.

The server is bound to `127.0.0.1` and accepts POST requests from any local
browser tab. The localhost bind is NOT a CSRF boundary. Real protection is a
per-invocation unguessable startup token.

### Token lifecycle

1. At startup the server generates a cryptographically random token (at minimum
   128 bits / 22+ base64url characters).
2. The token is injected into the served HTML as a JavaScript constant:
   ```html
   <script>const CSRF_TOKEN = "r4nD0m-t0k3n-v4lu3";</script>
   ```
   The constant name MUST be exactly `CSRF_TOKEN`. The footer script reads it at
   runtime and sends it as the `X-CSRF-Token` request header.
3. On every `POST /submit` the server checks the `X-CSRF-Token` header matches
   the startup token exactly (constant-time comparison). Absent or wrong → `403`.

**When the CSRF token is absent (saved / offline copy):** The footer script
disables the Send button if `CSRF_TOKEN` is not defined. A saved page opened as a
`file://` URL cannot reach the server; Send is the correct thing to disable. Save
remains functional.

### Origin / Sec-Fetch-Site validation

- If `Sec-Fetch-Site` is present, its value MUST be `"same-origin"` or `"none"`.
  Any other value → `403`.
- If `Origin` is present, it MUST match the server's own `http://127.0.0.1:<port>`
  origin. Mismatch → `403`.

These checks are secondary; the startup-token check is the primary defence.

---

## Response shape

### Success — `200 OK`

When `freeform` is non-empty:

```json
{ "ok": true }
```

When `freeform` is empty (silent close):

```json
{ "ok": true, "written": false }
```

The browser footer script treats both as a successful send and shows a status
message.

### Bad request — `400 Bad Request`

```json
{ "error": "<human-readable message>" }
```

Returned when: `Content-Type` is not `application/json`, the body is not valid
JSON, or the body is valid JSON but not an object. The server does **not** inspect
individual fields.

### CSRF failure — `403 Forbidden`

```json
{ "error": "forbidden" }
```

Returned when the `X-CSRF-Token` header is missing or incorrect, or
`Origin`/`Sec-Fetch-Site` validation fails.

### Too late — `410 Gone`

```json
{ "error": "already submitted" }
```

Returned when the server has already accepted one successful submit.

---

## Feedback file format

On a non-empty submit the server writes `<html-basename>.feedback.json` to the
per-invocation temp directory. The file is the parsed request body plus a
server-stamped timestamp:

```json
{
  "submittedAt": "<ISO-8601 timestamp>",
  "freeform": "<message>"
}
```

`submittedAt` is added by the server. All other fields are passed through from the
request body verbatim. The file is written atomically (write to a temp path, then
`fs.renameSync`) before `exit 0`.

Claude reads `freeform` as the user's follow-up message or feedback on the
visualization, then continues accordingly. See `references/visualize.md` Step 4 for
the re-invocation flow.
