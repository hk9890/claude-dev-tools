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

1. Load `html-visualization:html-visualize` for the mode routing table and the
   shared serve procedure.
2. Load and follow `references/feedback.md` (in the `html-visualize` skill) —
   render the content for inline commenting, run the Apply loop (re-serve on the
   same port after each Apply), and finish on Submit.
