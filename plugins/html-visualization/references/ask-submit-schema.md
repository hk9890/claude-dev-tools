# ask-mode `/submit` Payload Schema

The POST `/submit` payload produced by the ask-mode browser form
(`assets/ask/app.js`) and read back by Claude.

The wire format, CSRF and Origin checks, check order, response codes, and how the
feedback file is written are the same in every mode and live in
[submit-contract.md](submit-contract.md). This file owns the payload shape only.

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
| `verdict` | string | yes | The user's overall verdict on the plan or question batch. Allowed values: `"approve"`, `"approve-with-changes"`, `"reject"`, or `""`. An empty string means the user left the verdict unanswered — partial feedback is always accepted. `app.js` only ever emits one of these four values (the verdict radio group has no other options), so no value check is needed server-side. |
| `answers` | object | yes | A map from question ID to the user's answer. The object MAY be empty `{}` if no structured questions were posed. Individual questions MAY be left unanswered (text → `""`, radio → `null`, checkbox → `[]`). |
| `comments` | array | yes | Per-question free-text notes, each anchored to a question widget. MAY be empty `[]`. |
| `freeform` | string | yes | Unstructured free-text feedback. MUST be present; MAY be an empty string `""`. |

`app.js` always emits all four fields in every request (`buildAskPayload`
fills in safe defaults for any that are missing from its input state), so a
read-back can rely on all four being present.

### `answers` — question IDs and values

- **`qID`** format: non-empty string, printable ASCII only (`0x20`–`0x7E`), no whitespace.  Claude MUST use stable, collision-free IDs within a single invocation (e.g. `q1`, `q2`, or a short slug).
- **value type**: any JSON scalar or array. Claude documents the expected type per question in the HTML (see `ask-markup.md`, same directory). The server stores values as-is without type coercion.

### `comments` — per-question notes

Each element of the `comments` array MUST have exactly two fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `anchor` | string | yes | CSS selector identifying the question widget the note belongs to — always `#<data-qid>` (e.g. `"#q2"`). The server stores this verbatim. |
| `text` | string | yes | The note text. MUST NOT be an empty string when the element is present in the array — the browser-side form MUST omit empty notes from the array entirely. |

## Feedback file

`feedback.html` → `feedback.feedback.json`, with the request body passed through
and `submittedAt` stamped by the server:

```json
{
  "submittedAt": "<ISO-8601 timestamp>",
  "verdict":    "<string>",
  "answers":    { "<qID>": <value> },
  "comments":   [ { "anchor": "<string>", "text": "<string>" } ],
  "freeform":   "<string>"
}
```
