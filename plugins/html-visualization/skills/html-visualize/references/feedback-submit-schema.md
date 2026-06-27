# feedback-mode `/submit` Payload Schema

The POST `/submit` payload produced by the feedback-mode browser document
(`assets/feedback/app.js`) and read back by Claude.

The shared `bin/server.js` is **schema-agnostic** — it accepts any JSON object,
stamps `submittedAt`, and writes it verbatim. It does not validate the fields
below. Conforming to this schema is the responsibility of `assets/feedback/app.js`
(which emits it) and Claude (which reads it back). The server's only hard
guarantees are CSRF/Origin checks, an `application/json` Content-Type, a
JSON-object body, and the one-shot lifecycle.

## Wire format

- **Method**: `POST`
- **Path**: `/submit`
- **Content-Type**: `application/json`
- **Required header**: `X-CSRF-Token: <startup-token>` (see CSRF section below)

## Request body

```json
{
  "action": "apply" | "submit",
  "comments": [
    {
      "blockId": "<string>",
      "blockText": "<string>",
      "quote": "<string>",
      "quoteStart": <integer>,
      "text": "<string>"
    }
  ],
  "freeform": "<string>"
}
```

### Field definitions

| Field | Type | Description |
|---|---|---|
| `action` | string | `"apply"` — an iterative round: Claude applies the feedback, regenerates the document, and re-serves it for another pass. `"submit"` — the final round: Claude applies the feedback and stops. `app.js` emits `"submit"` for any value that is not exactly `"apply"`. |
| `comments` | array | One entry per comment the user attached to a block. MAY be empty `[]`. |
| `freeform` | string | Overall free-text feedback not tied to any block. MAY be `""`. |

`app.js` always emits all three fields.

### `comments` — block-anchored notes

Each element of `comments` has exactly five fields:

| Field | Type | Description |
|---|---|---|
| `blockId` | string | The `data-block-id` of the block the comment is anchored to. |
| `blockText` | string | The block's plain text, captured before any UI controls were injected. Lets read-back be self-contained without re-parsing the HTML. MAY be truncated for very long blocks. |
| `quote` | string | The exact text the user selected inside the block. `""` when the user selected nothing — the comment then applies to the whole block. |
| `quoteStart` | integer | Character offset of `quote` within the normalized `blockText` string. `-1` when `quote` is `""` (block-level comment), or when the offset could not be determined. When `quoteStart >= 0`, `blockText.substring(quoteStart, quoteStart + quote.length)` SHOULD equal `quote` — use this to locate the exact phrase for word-level comments, and to disambiguate when the same phrase appears multiple times in the block. |
| `text` | string | The user's comment. Never empty — `app.js` drops comments with empty text before sending. |

Multiple comments MAY share the same `blockId` (the user commented on different
selections within one block).

---

## CSRF protection

The server is bound to `127.0.0.1` and accepts POST requests from any local
browser tab. The localhost bind is NOT a CSRF boundary. Real protection is a
per-invocation unguessable startup token.

### Token lifecycle

1. At startup the server generates a cryptographically random token (at minimum
   128 bits / 22+ base64url characters).
2. The token is embedded in the served HTML as a JavaScript constant:
   ```html
   <script>const CSRF_TOKEN = "r4nD0m-t0k3n-v4lu3";</script>
   ```
   The constant name MUST be exactly `CSRF_TOKEN`.
3. The browser-side submit handler reads `CSRF_TOKEN` and sends it as the
   `X-CSRF-Token` request header.
4. On every `POST /submit` the server checks the `X-CSRF-Token` header matches
   the startup token exactly (constant-time comparison). Absent or wrong → `403`.

### Origin / Sec-Fetch-Site validation

- If `Sec-Fetch-Site` is present, its value MUST be `"same-origin"` or `"none"`.
  Any other value → `403`.
- If `Origin` is present, it MUST match the server's own `http://127.0.0.1:<port>`
  origin. Mismatch → `403`.

These checks are secondary; the startup-token check is the primary defence.

---

## Response shape

### Success — `200 OK`

```json
{ "ok": true }
```

The server writes the feedback file, then exits with code `0`.

### Bad request — `400 Bad Request`

```json
{ "error": "<human-readable message>" }
```

Returned when: `Content-Type` is not `application/json`, the body is not valid
JSON, or the body is valid JSON but not an object. The server does **not**
inspect individual fields.

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

On success the server writes a `<basename>.feedback.json` to the per-invocation
temp directory. The file is the parsed request body plus a server-stamped
timestamp:

```json
{
  "submittedAt": "<ISO-8601 timestamp>",
  "action": "apply" | "submit",
  "comments": [
    {
      "blockId": "<string>",
      "blockText": "<string>",
      "quote": "<string>",
      "quoteStart": <integer>,
      "text": "<string>"
    }
  ],
  "freeform": "<string>"
}
```

`submittedAt` is added by the server. All other fields are passed through from the
request body verbatim. The file is written atomically (write to a temp path, then
`fs.renameSync`) before `exit 0`.

Claude branches its read-back on `action`: `"apply"` → apply the feedback,
regenerate the document, and re-serve for another round; `"submit"` → apply the
feedback and finish. See `references/feedback.md` for the full loop.
