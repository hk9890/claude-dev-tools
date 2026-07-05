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
   build the HTML page from the intent above and serve it non-blocking with
   `--no-wait`. Continue immediately after surfacing the URL. The page has an
   always-on footer; if the user sends a non-empty message the harness re-invokes
   Claude with a feedback file — but that is asynchronous and optional.
3. The shared server lifecycle is `references/serve.md`.
