---
name: html-visualize-feedback
description: "Render a document, draft, or plan as a browser HTML page the user marks up with inline comments — feedback mode of html-visualize."
when_to_use: "Use when the user explicitly asks to review a document, draft, article, plan, proposal, or set of options as a rendered browser page they attach inline comments to. Triggers on 'let me mark this up in the browser', 'render this plan so I can comment on it', 'I want inline comments on this'. Naming the browser surface is the trigger — having something to review on its own is not, so take that feedback in chat. Not for a batch of open questions or approve/reject decisions (`html-visualization:html-visualize-ask`); for a page the user only reads, point them at `/html-visualization:html-visualize-page`."
argument-hint: "[content-to-review]"
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
