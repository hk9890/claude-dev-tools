---
name: html-visualize-page
description: "Render a browser HTML page — visualization, chart, or data summary — and serve it non-blocking; visualize mode of the html-visualize workflow."
argument-hint: "[what-to-visualize]"
user-invocable: true
disable-model-invocation: true
---

## Workflow

What to display as a visualization, diagram, chart, or data summary, given
directly, or nothing when the subject is whatever the conversation was just
discussing:

$ARGUMENTS

Work from that directly; do not ask the user to restate it.

Load and follow [`../../references/visualize.md`](../../references/visualize.md) —
build the HTML page from the intent above, serve it non-blocking with `--no-wait`,
and continue immediately after surfacing the URL. It carries the visualize-specific
authoring and rendering choices, and points on to the shared serve procedure and
authoring guidelines.

The `../..` is deliberate: this plugin takes the plugin-root layout, with
`references/`, `bin/`, and `assets/` shared by all three mode skills.
