---
name: html-visualize-feedback
description: "Render a document, draft, or plan as a browser HTML page the user marks up with inline comments — feedback mode of html-visualize."
argument-hint: "[content-to-review]"
user-invocable: true
disable-model-invocation: true
---

## Workflow

What to render for review — a document, draft, article, plan, proposal, or set
of brainstormed options (including ideas Claude authored in the conversation),
given as the text itself, a path to it, or nothing when the source is the
conversation itself:

$ARGUMENTS

Work from that directly; do not ask the user to restate it.

Load and follow [`../../references/feedback.md`](../../references/feedback.md) —
render the content for inline commenting, run the Apply loop (re-serve on the same
port after each Apply), and finish on Submit. It carries the feedback-specific
rendering and loop, and points on to the shared serve procedure and authoring
guidelines.

The `../..` is deliberate: this plugin takes the plugin-root layout, with
`references/`, `bin/`, and `assets/` shared by all three mode skills.
