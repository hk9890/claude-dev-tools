---
name: html-visualize-ask
description: "Render a browser HTML question/decision form for the user to answer — ask mode of the html-visualize workflow."
user-invocable: true
disable-model-invocation: true
---

## Workflow

The user's command argument (`ARGUMENTS`) is the free-text intent — the questions
or approve/reject decisions to put on the form. It is the content to render; do
not ask the user to restate it.

1. Load `html-visualization:html-visualize` for the mode routing table and the
   shared serve procedure.
2. Load and follow `references/ask.md` (in the `html-visualize` skill) — build the
   question/decision form from `ARGUMENTS`, serve it with the blocking submit
   round-trip, and read back the user's verdict and answers.
3. The shared server lifecycle is `references/serve.md`.
