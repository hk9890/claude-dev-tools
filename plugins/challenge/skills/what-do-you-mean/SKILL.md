---
name: what-do-you-mean
description: "That last message did not land — re-pitch it in 400 words."
user-invocable: true
disable-model-invocation: true
argument-hint: "[what-did-not-land]"
---

Wait — I don't follow. Re-pitch $ARGUMENTS (with no argument, your last message, whole) in
400 words: a little context first, ASD-STE100 Simplified Technical English, the ubiquitous
language this project already uses, and say what each thing *is* rather than the label the
chat gave it — "the shared-database option", never "option A". Close by naming what you
left out.

Then, if you have `html-visualize-feedback` available, print this line so I can take the
long form in a browser, pointing it at [the brief](references/html-explanation.md) with the
resolved absolute path:

```
/html-visualization:html-visualize-feedback explain <subject> — follow the brief at <base directory for this skill>/references/html-explanation.md; it is instructions for the page, not content to typeset
```
