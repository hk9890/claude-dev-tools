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

Relay the two groups separately: the settled ones as a batch you can just do, then the
open ones last, numbered on through two lists that the user answers in one reply:

1. **Done on "go"** — each open item whose recommendation you stand behind, where the
   change stays inside what was reviewed and is easy to undo: one line each, the item
   and the option you take. A "go" takes every item of this list; the user names only
   those they object to.
2. **Needs you** — each open item that the user owns: it changes a project rule, a name
   or interface other people use, or another repository, it rewrites pushed history,
   it accepts a cost or risk that falls on the user, or it has no `recommendation`.
   Lead each with that reason in one sentence. The question reads without the review
   beside it: what is wrong, where, and what each option changes for the user. It
   carries the item's `options` in the review's words; the option its `recommendation`
   picks comes first, marked as recommended, with the reason and the cost the review
   gave. An item with no `options` asks whether to apply it as stated; an item with no
   `recommendation` says that it has none.

An open item with no reason for **Needs you** goes to **Done on "go"**.

## The browser form

With no item in **Needs you**, skip this section.

After the relay and any saved report, state the count of items in **Needs you** and give this
command for the user to type, to answer them on a browser form; it needs the separate
`html-visualization` plugin. Never call that skill yourself, nor build its form by other
means: it is the user's to type.
Keep the filter in its argument, so it survives into a fresh turn:

```
/html-visualization:html-visualize-ask the <N> decisions that need me from <what was reviewed> — leave out the settled fixes and the items done on "go"
```

Then say that the form holds only the **Needs you** items, and that a reply in chat
stops any settled or "go" one.
