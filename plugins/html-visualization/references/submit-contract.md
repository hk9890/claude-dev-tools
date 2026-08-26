# The `/submit` contract (shared by every mode)

What `bin/server.js` guarantees for a submit, in every mode. The per-mode
`<mode>-submit-schema.md` files own the payload shape and nothing here.

The server is **schema-agnostic** — it accepts any JSON object, stamps
`submittedAt`, and writes it verbatim. It validates no field. Conforming to a
payload schema is therefore the responsibility of the browser-side script that
emits it and of Claude, which reads it back. The server's hard guarantees are
exactly the ones below: CSRF and Origin checks, an `application/json`
Content-Type, a JSON-object body, and the one-shot lifecycle.

## Wire format

- **Method**: `POST`
- **Path**: `/submit`
- **Content-Type**: `application/json`
- **Required header**: `X-CSRF-Token: <startup-token>`

## CSRF protection

The server is bound to every interface (dual-stack where the OS supports it) and
accepts POST requests from any browser tab that can reach the port — local or on
the network. The bind is NOT a CSRF boundary and NOT an access boundary. Real
protection is a per-invocation unguessable startup token, and it proves only that
a request came from the served page: `GET /` hands the token to whoever asks.

### Token lifecycle

1. At startup the server generates a cryptographically random token (at minimum
   128 bits / 22+ base64url characters), persisted to `.csrf` so it survives an
   Apply restart — see [serve.md](serve.md), which owns that file.
2. The token is injected into the served HTML as a JavaScript constant:
   ```html
   <script>const CSRF_TOKEN = "r4nD0m-t0k3n-v4lu3";</script>
   ```
   The constant name MUST be exactly `CSRF_TOKEN`. The browser-side submit
   handler reads it and sends it as the `X-CSRF-Token` request header.
3. On every `POST /submit` the server compares the `X-CSRF-Token` header against
   the startup token with a constant-time comparison (`timingSafeEqual`).
   Absent or wrong → `403`, and no feedback file is written.

### Origin / Sec-Fetch-Site validation

- If `Sec-Fetch-Site` is present, its value MUST be `"same-origin"` or `"none"`.
  Any other value → `403`.
- If `Origin` is present, its **host** MUST equal the `Host` header of the same
  request — the server answers to every name that resolves to it, so there is no
  single origin string to compare against. Compare hosts, not whole origins: a
  TLS-terminating forwarder gives the browser an `https://` page while the server
  speaks `http`, and matching the scheme too would reject every submit made
  through one. Mismatch, or an unparseable `Origin` (including the literal
  `null`) → `403`.

Both checks are conditional on the header being present, and both are secondary:
the startup-token check is the primary defence.

## Check order

The server checks in this order, and the first failure wins:

1. **Already submitted** → `410`. This is checked *before* the token, so a
   duplicate submit from a valid page still gets `410` rather than `403`.
2. **CSRF token** → `403`.
3. **`Sec-Fetch-Site`, then `Origin`** → `403`.
4. **Content-Type**, then body readable, then valid JSON, then a JSON object
   → `400`.

Once every check passes the server marks the submit accepted, which is what makes
a second one `410`.

## Response shape

### Success — `200 OK`

```json
{ "ok": true }
```

The server writes the feedback file, then exits with code `0`. A mode that runs
with submit optional has a second success form for the empty case; its own schema
file documents that.

### Bad request — `400 Bad Request`

```json
{ "error": "<human-readable message>" }
```

Returned when `Content-Type` is not `application/json`, the body cannot be read,
the body is not valid JSON, or the body is valid JSON but not an object (an array
or a scalar). The server does **not** inspect individual fields.

### CSRF failure — `403 Forbidden`

```json
{ "error": "forbidden" }
```

Returned when `X-CSRF-Token` is missing or incorrect, or when
`Origin`/`Sec-Fetch-Site` validation fails.

### Too late — `410 Gone`

```json
{ "error": "already submitted" }
```

Returned once the server has accepted one successful submit. A duplicate submit
MUST get `410`, never `200`.

## Feedback file format

On a written submit the server writes `<html-basename>.feedback.json` next to the
served HTML file in the per-invocation temp directory (`feedback.html` →
`feedback.feedback.json`). The file is the parsed request body plus one
server-added field:

```json
{ "submittedAt": "<ISO-8601 timestamp>", "...": "every field of the request body, verbatim" }
```

`submittedAt` is added by the server; everything else passes through untouched.
The write is atomic — a temp path, then `fs.renameSync` — and completes before
`exit 0`. Each mode's schema file gives the concrete shape its payload produces.
