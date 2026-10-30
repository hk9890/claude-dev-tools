# Settled and open

Every review here classifies what it found into two kinds, and every skill relays
them the same way. This file governs that for `project-review`; each review owns
only what the line means in its own domain.

`project-auto-work` carries its own copy of the same vocabulary, because plugins
install independently and neither can reach the other's files. Changing what
settled or open *means* is a two-file edit, in both plugins, or they drift.

| Kind | What it is |
|---|---|
| **settled** | One correct answer, and no consequence anyone could reasonably weigh differently. Just do it. |
| **open** | A competent person could answer differently — it changes a name people type, picks between conventions the project already uses, trades one cost against another, or is big enough that "not now" is a real answer. Ask. |

The review assigns this, not the relay — the workflow where one runs, the
reviewing agent where none does. Carry each item into the group it came back in.

## Relaying

Relay the two groups separately: the settled ones as a batch you can just do, the
open ones as questions carrying their `options` and `recommendation`.

## The browser form

With no open item, skip this section.

After the relay and any saved report, state the count of open items and give this
command for the user to type, to answer them on a browser form; it needs the separate
`html-visualization` plugin. Never call that skill yourself: it is the user's to type.
Keep the filter in its argument, so it survives into a fresh turn:

```
/html-visualization:html-visualize-ask the <N> open decisions from <what was reviewed> — the settled fixes are already agreed
```

Then say that the form holds only the open items, and that a reply in chat stops any
settled one.
