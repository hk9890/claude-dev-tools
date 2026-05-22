---
name: html-visualize-demo
description: "Render a display-only browser HTML visualization, diagram, chart, or data summary — visualize mode of the html-visualize workflow."
user-invocable: true
disable-model-invocation: true
---

## Workflow

The user's command argument (`ARGUMENTS`) is the free-text intent — what to
display as a visualization, diagram, chart, or data summary. It is the content to
render; do not ask the user to restate it.

1. Load `html-visualization:html-visualize` for the mode routing table and the
   shared serve procedure.
2. Load and follow `references/visualize.md` (in the `html-visualize` skill) —
   build the display-only HTML page from `ARGUMENTS` and serve it non-blocking
   with `--no-wait`. There is no submit round-trip.
3. The shared server lifecycle is `references/serve.md`.
