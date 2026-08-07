# Settled and open

Every review here classifies what it found into two kinds, and both skills relay
them the same way. This file governs that for `project-review`; each skill's
workflow owns only what the line means in its own domain.

`project-auto-work` carries its own copy of the same vocabulary, because plugins
install independently and neither can reach the other's files. Changing what
settled or open *means* is a two-file edit, in both plugins, or they drift.

| Kind | What it is |
|---|---|
| **settled** | One correct answer, and no consequence anyone could reasonably weigh differently. Just do it. |
| **open** | A competent person could answer differently — it changes a name people type, picks between conventions the project already uses, trades one cost against another, or is big enough that "not now" is a real answer. Ask. |

The workflow assigns this, not the relay. Carry each item into the group the
report put it in.

## Relaying

Relay the two groups separately: the settled ones as a batch you can just do, the
open ones as questions carrying their `options` and `recommendation`.

## The browser form

The form covers the open items only, and `html-viz` decides how it is reached.
The relay above and the saved report happen first and in full either way, so the
form adds a surface and takes nothing away — a missing plugin, an absent Node, or
a closed tab leaves the user exactly where the review would have left them.

**With `html-viz`**, invoke `html-visualization:html-visualize-ask` through the
`Skill` tool, passing the open items and naming what was reviewed:

```
the <N> open decisions from <what was reviewed> — the settled fixes are already agreed
```

Invoking it in this turn is what keeps the report in context when the answers
come back, so the picks read as the reply the user would otherwise have typed.

**Without it**, offer the form instead of opening one. State the count, and give
the command with the filter in the argument so it survives into a fresh turn:

```
/html-visualization:html-visualize-ask the <N> open decisions from <what was reviewed> — the settled fixes are already agreed
```

Either path needs the separate `html-visualization` plugin, which is not a
dependency of this one. Offer the command only if that skill exists; when the
flag was passed and it is absent, say the flag needs that plugin installed, then
put the same questions in chat.

Then say plainly that the settled batch is not on the form, and that the form's
free-text box is where they stop any of it. A settled item is one the user never
saw a question about, so an item filed wrongly is one they never hear of at all —
naming the batch is what keeps that recoverable.
