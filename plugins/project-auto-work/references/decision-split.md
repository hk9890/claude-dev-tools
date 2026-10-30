# Settled and open

Both skills here classify what a run proposed into two kinds, and relay them the
same way. This file governs that for `project-auto-work`; each skill's workflow
owns only what the line means in its own domain.

`project-review` carries its own copy of the same vocabulary, because plugins
install independently and neither can reach the other's files. Changing what
settled or open *means* is a two-file edit, in both plugins, or they drift.

| Kind | What it is |
|---|---|
| **settled** | One correct answer, and no consequence anyone could reasonably weigh differently. Just do it. |
| **open** | A competent person could answer differently — it changes a name people type, picks between conventions the project already uses, trades one cost against another, or is big enough that "not now" is a real answer. Ask. |

The workflow assigns this, not the relay. Carry each proposal into the group the
report put it in.

Two things are open by construction, whatever the tag says: `test-app`'s
`questions[]`, which exist because the run could not settle them, and any
`test-tests` proposal resting on a `candidate: true` finding — a possible
equivalent mutant or a legitimate latency contract is exactly the call a human
has to make.

## Relaying

Relay the two groups separately: the settled ones as a batch, then the open ones
last, as one numbered list the user answers in one reply, one question per item.
Each question reads without the report beside it, and carries the item's `options`
in the report's words. The option its `recommendation` picks comes first, marked as
recommended, with the reason and the cost the report gave. An item with no `options`
asks whether to apply it as stated; an item with no `recommendation` says that it has
none.

Neither skill acts on either group. The report names the work; what happens next
is the user's to say, in the same way they would answer any other message.

## The browser form

Only where `html-viz` was passed and an item is open, read [browser-form.md](browser-form.md)
beside this file and follow it.
