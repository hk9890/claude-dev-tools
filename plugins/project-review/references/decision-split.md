# Settled and open

Every review here classifies what it found into two kinds, and both skills relay
them the same way. This file is the single source of truth for the vocabulary and
the relay; each skill's workflow owns only what the line means in its own domain.

| Kind | What it is |
|---|---|
| **settled** | One correct answer, and no consequence anyone could reasonably weigh differently. Just do it. |
| **open** | A competent person could answer differently — it changes a name people type, picks between conventions the project already uses, trades one cost against another, or is big enough that "not now" is a real answer. Ask. |

The workflow assigns this, not the relay. Carry each item into the group the
report put it in.

## Relaying

Relay the two groups separately: the settled ones as a batch you can just do, the
open ones as questions carrying their `options` and `recommendation`.

## Offering the form

Offer a browser form over the open items only. State the count, and give the
command with the filter in the argument so it survives into a fresh turn:

```
/html-visualization:html-visualize-ask the <N> open decisions from <what was reviewed> — the settled fixes are already agreed
```

Offer it only if that skill exists; it ships in the separate `html-visualization`
plugin.

Then say plainly that the settled batch is not on the form, and that the form's
free-text box is where they stop any of it. A settled item is one the user never
saw a question about, so an item filed wrongly is one they never hear of at all —
naming the batch is what keeps that recoverable.
