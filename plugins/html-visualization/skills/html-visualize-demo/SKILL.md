---
name: html-visualize-demo
description: "Render a display-only browser HTML visualization, diagram, chart, or data summary — visualize mode of the html-visualize workflow."
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
   build the display-only HTML page from the intent above and serve it
   non-blocking with `--no-wait`. There is no submit round-trip.
3. The shared server lifecycle is `references/serve.md`.
