---
name: html-visualize-demo
description: "Render a browser HTML visualization, chart, or data summary and serve it non-blocking — visualize mode of html-visualize."
argument-hint: "[what-to-visualize]"
user-invocable: true
disable-model-invocation: true
---

## Workflow

What to display as a visualization, diagram, chart, or data summary:

$ARGUMENTS

Work from that directly; do not ask the user to restate it.

1. Load `html-visualization:html-visualize` for the mode routing table and the
   shared serve procedure.
2. Load and follow `references/visualize.md` (in the `html-visualize` skill) —
   build the HTML page from the intent above, serve it non-blocking with
   `--no-wait`, and continue immediately after surfacing the URL.
