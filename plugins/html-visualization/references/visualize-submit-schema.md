# visualize-mode `/submit` Payload Schema

The POST `/submit` payload produced by the visualize-mode footer
(`visualize-template.html` inline script) and read back by Claude on re-invocation.

The wire format, CSRF and Origin checks, check order, response codes, and how the
feedback file is written are the same in every mode and live in
[submit-contract.md](submit-contract.md). This file owns the payload shape and the
two things visualize does differently: submit is optional here, and the page is
meant to survive being saved.

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
clicked Send with an empty or whitespace-only box (the UI trims before submitting).

## Submit is optional here — three outcomes, all exit 0

Visualize is the only mode the server runs with submit optional
(`submitOptional = mode === 'visualize'` in `bin/server.js`), so an empty message
is a valid way to finish rather than a bad request:

| Condition | Server action |
|---|---|
| `freeform` is a non-empty string | Writes `<basename>.feedback.json`, exits 0 → harness re-invokes Claude |
| `freeform` is `""` or missing | Exits 0 silently — no feedback file written, Claude not re-invoked |
| Tab closed, or no heartbeat for `--grace-sec` (default 900 s) | Exits 0 silently — no feedback file written, Claude not re-invoked |

"Non-empty" is checked on the raw string value; trimming is the UI's responsibility.

That second outcome is the one extra success response this mode has. Where
[submit-contract.md](submit-contract.md) gives `{ "ok": true }`, a silent close
answers:

```json
{ "ok": true, "written": false }
```

The footer script treats both as a successful send and shows a status message.

## A saved copy has no token

The footer script disables the Send button when `CSRF_TOKEN` is not defined. A
visualize page saved to disk and reopened as a `file://` URL cannot reach the
server, so Send is the correct thing to disable; Save stays functional. Ask and
feedback pages are served-only and carry no such guard.

## Feedback file

`<html-basename>.feedback.json`, the request body passed through with
`submittedAt` stamped by the server:

```json
{
  "submittedAt": "<ISO-8601 timestamp>",
  "freeform": "<message>"
}
```

Claude reads `freeform` as the user's follow-up message or feedback on the
visualization, then continues accordingly. See `visualize.md`, same directory,
Step 4 for the re-invocation flow.
