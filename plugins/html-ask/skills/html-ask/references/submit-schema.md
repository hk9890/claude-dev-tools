# `/submit` Payload Schema

Single source of truth for the POST `/submit` contract between the browser-side form (aa9.3) and the zero-dependency Node server (aa9.2). Both sides MUST conform to this document. Any change here requires corresponding updates in both aa9.2 and aa9.3.

## Wire format

- **Method**: `POST`
- **Path**: `/submit`
- **Content-Type**: `application/json`
- **Required header**: `X-CSRF-Token: <startup-token>` (see CSRF section below)

## Request body

```json
{
  "verdict":   "<string>",
  "answers":   { "<qID>": <value> },
  "comments":  [ { "anchor": "<string>", "text": "<string>" } ],
  "freeform":  "<string>"
}
```

### Field definitions

| Field | Type | Required | Description |
|---|---|---|---|
| `verdict` | string | yes | The user's overall verdict on the plan or question batch. Allowed values: `"approve"`, `"approve-with-changes"`, `"reject"`. The server MUST reject any other value with `400`. |
| `answers` | object | yes | A map from question ID to the user's answer. The object MAY be empty `{}` if no structured questions were posed. |
| `comments` | array | yes | Inline comments anchored to specific locations in the HTML document. MAY be empty `[]`. |
| `freeform` | string | yes | Unstructured free-text feedback. MUST be present; MAY be an empty string `""`. |

All four fields MUST be present in every request. A missing field MUST cause a `400` response.

### `answers` — question IDs and values

- **`qID`** format: non-empty string, printable ASCII only (`0x20`–`0x7E`), no whitespace.  Claude MUST use stable, collision-free IDs within a single invocation (e.g. `q1`, `q2`, or a short slug).
- **value type**: any JSON scalar or array. Claude documents the expected type per question in the HTML (see aa9.3 markup contract). The server stores values as-is without type coercion.

### `comments` — inline anchored comments

Each element of the `comments` array MUST have exactly two fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `anchor` | string | yes | CSS selector that uniquely identifies the HTML element the comment is attached to (e.g. `"#q2"`, `"[data-qid='decision-3']"`). The server stores this verbatim. |
| `text` | string | yes | The comment text. MUST NOT be an empty string when the element is present in the array — the browser-side form MUST omit zero-length comments from the array entirely. |

---

## CSRF protection

The server is bound to `127.0.0.1` and accepts POST requests from any local browser tab. The localhost bind is NOT a CSRF boundary. Real protection is a per-invocation unguessable startup token.

### Token lifecycle

1. At server startup the server generates a cryptographically random token (at minimum 128 bits / 22+ base64url characters).
2. The token is embedded in the served HTML document as a JavaScript constant in a `<script>` block:
   ```html
   <script>const CSRF_TOKEN = "r4nD0m-t0k3n-v4lu3";</script>
   ```
   The constant name MUST be exactly `CSRF_TOKEN`.
3. The browser-side submit handler reads `CSRF_TOKEN` and sends it as the `X-CSRF-Token` request header.
4. On every `POST /submit` request the server MUST:
   - Check that the `X-CSRF-Token` header is present and matches the startup token exactly (constant-time comparison SHOULD be used).
   - If the header is absent or does not match, respond `403` with no feedback written.

### Origin / Sec-Fetch-Site validation

The server MUST additionally validate:

- If `Sec-Fetch-Site` is present, its value MUST be `"same-origin"` or `"none"`. Any other value (e.g. `"cross-site"`) MUST result in `403`.
- If `Origin` is present, it MUST match the server's own `http://127.0.0.1:<port>` origin. Mismatch MUST result in `403`.

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

Returned when: required field is missing, `verdict` is not one of the allowed values, or `Content-Type` is not `application/json`.

### CSRF failure — `403 Forbidden`

```json
{ "error": "forbidden" }
```

Returned when: `X-CSRF-Token` header is missing or incorrect, or `Origin`/`Sec-Fetch-Site` validation fails.

### Too late — `410 Gone`

```json
{ "error": "already submitted" }
```

Returned when the server has already accepted one successful submit and is in the process of shutting down. The server MUST reject duplicate submits with `410`, not `200`.

---

## Feedback file format

On success the server writes a `<invocation-id>.feedback.json` to the per-invocation temp directory. The file contains the raw parsed request body plus metadata:

```json
{
  "submittedAt": "<ISO-8601 timestamp>",
  "verdict":    "<string>",
  "answers":    { "<qID>": <value> },
  "comments":   [ { "anchor": "<string>", "text": "<string>" } ],
  "freeform":   "<string>"
}
```

The `submittedAt` field is added by the server. All other fields are passed through from the request body verbatim. The file is written atomically (write to a temp path, then `fs.renameSync`) before `exit 0` is called.
