---
name: html-visualize-ask
description: "Put open questions or approve/reject decisions on a browser HTML form the user answers."
when_to_use: "Use when the user asks for questions or decisions on a browser form or web page. Triggers on 'ask me these questions in a browser form', 'a web form for these decisions'. Without that request, ask in chat. Not for marking up a document (`html-visualization:html-visualize-feedback`); for a page the user only reads, point them at `/html-visualization:html-visualize-page`."
argument-hint: "[questions-or-decisions]"
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
