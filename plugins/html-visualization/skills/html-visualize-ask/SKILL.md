---
name: html-visualize-ask
description: "Render a browser HTML question/decision form for the user to answer — ask mode of html-visualize."
argument-hint: "[questions-or-decisions]"
user-invocable: true
disable-model-invocation: true
---

## Workflow

The questions or approve/reject decisions to put on the form, given directly, or
nothing when the open questions are the ones already on the table in this
conversation:

$ARGUMENTS

Work from that directly; do not ask the user to restate it.

Load and follow [`../../references/ask.md`](../../references/ask.md) — build the
question/decision form from the intent above, serve it with the blocking submit
round-trip, and read back the user's verdict and answers. It carries the
ask-specific authoring and read-back, and points on to the shared serve procedure
and authoring guidelines.

The `../..` is deliberate: this plugin takes the plugin-root layout, with
`references/`, `bin/`, and `assets/` shared by all three mode skills.
