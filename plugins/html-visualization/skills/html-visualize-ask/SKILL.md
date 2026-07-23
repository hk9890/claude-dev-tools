---
name: html-visualize-ask
description: "Render a browser HTML question/decision form for the user to answer — ask mode of html-visualize."
argument-hint: "[questions-or-decisions]"
user-invocable: true
disable-model-invocation: true
---

## Workflow

The questions or approve/reject decisions to put on the form:

$ARGUMENTS

Work from that directly; do not ask the user to restate it.

1. Load `html-visualization:html-visualize` for the mode routing table and the
   shared serve procedure.
2. Load and follow `references/ask.md` (in the `html-visualize` skill) — build the
   question/decision form from the intent above, serve it with the blocking
   submit round-trip, and read back the user's verdict and answers.
