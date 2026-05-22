---
name: html-visualize-feedback
description: "Render existing content as a browser HTML page the user marks up with inline comments — feedback mode of the html-visualize workflow."
user-invocable: true
disable-model-invocation: true
---

## Workflow

The user's command argument (`ARGUMENTS`) identifies the content to render for
review — a document, draft, article, plan write-up, or any prose. It is the
content to render; do not ask the user to restate it.

1. Load `html-visualization:html-visualize` for the mode routing table and the
   shared serve procedure.
2. Load and follow `references/feedback.md` (in the `html-visualize` skill) —
   render the content for inline commenting, run the Apply loop (re-serve on the
   same port after each Apply), and finish on Submit.
3. The shared server lifecycle is `references/serve.md`.
