---
name: html-visualize
description: "Shared reference library for the html-visualize browser-HTML workflow — loaded by html-visualize-ask, html-visualize-feedback, and html-visualize-demo; not invoked directly."
user-invocable: false
---

## How to use

This skill is the shared logic for rendering interactive HTML the user opens in a
browser. It is loaded by one of three command skills — each command has already
fixed the mode, so there is no intent classification to do here. Load the
reference doc for the active mode and follow it end to end.

The free-text intent the user typed as the command argument is the content to
render. Carry it into the mode reference's "decide what to render" step.

## Mode routing

| Mode | Invoked by | Load and follow |
|---|---|---|
| `ask` — question/decision form with a blocking submit round-trip | `html-visualize-ask` | [references/ask.md](references/ask.md) |
| `feedback` — existing content for inline commenting, with an Apply loop | `html-visualize-feedback` | [references/feedback.md](references/feedback.md) |
| `visualize` — display-only page, non-blocking `--no-wait` serve | `html-visualize-demo` | [references/visualize.md](references/visualize.md) |

## Shared serve procedure

All three modes share one server lifecycle — pre-flight, temp dir, the three
server cycles, the `.port` + `fb-generation` contract, URL surfacing, and cleanup.
It is documented once in [references/serve.md](references/serve.md); each mode
reference points back to it.
