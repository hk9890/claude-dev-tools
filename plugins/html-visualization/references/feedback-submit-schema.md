# feedback-mode `/submit` Payload Schema

The POST `/submit` payload produced by the feedback-mode browser document
(`assets/feedback/app.js`) and read back by Claude.

The wire format, CSRF and Origin checks, check order, response codes, and how the
feedback file is written are the same in every mode and live in
[submit-contract.md](submit-contract.md). This file owns the payload shape only.

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

## Feedback file

The request body passed through, with `submittedAt` stamped by the server:

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

Claude branches its read-back on `action`: `"apply"` → apply the feedback,
regenerate the document, and re-serve for another round; `"submit"` → apply the
feedback and finish. See `feedback.md`, same directory, for the full loop.
