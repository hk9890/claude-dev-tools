---
name: html-visualize
description: "Shared reference library for the html-visualize browser-HTML workflow — loaded by html-visualize-ask, html-visualize-feedback, and html-visualize-demo; not invoked directly."
user-invocable: false
---

## How to use

Render interactive HTML the user opens in a browser. Three modes cover the
cases — ask, feedback, and visualize. The mode is already determined; do not
re-classify it. Pick the active mode from the table below, read its reference
doc, and follow it end to end.

The user's intent — the questions to ask, the content to mark up, or what to
visualize — is the content to render. Carry it into the mode reference's
"decide what to render" step.

## Mode routing

| Mode | Invoked by | Load and follow |
|---|---|---|
| `ask` — question/decision form with a blocking submit round-trip | `html-visualize-ask` | [references/ask.md](references/ask.md) |
| `feedback` — content (document, plan, or brainstormed options) for inline commenting, with an Apply loop | `html-visualize-feedback` | [references/feedback.md](references/feedback.md) |
| `visualize` — display-only page, non-blocking `--no-wait` serve | `html-visualize-demo` | [references/visualize.md](references/visualize.md) |

## Authoring guidelines — all modes

These apply to every mode. The goal is a page the user can take in at a glance
and act on without effort.

- **Make the page stand alone.** A clear title and a one-line subtitle must
  orient a reader who has none of the chat context. The user should be able to
  open, read, and understand the page — or bookmark and share it — on its own.

- **Lead with what matters; keep it scannable.** Put the most important content
  first. Use headings, whitespace, and visual hierarchy so the user finds the
  point without hunting. One long undifferentiated wall of text is hard to
  consume.

- **Every visual must earn its place.** Tables, colour, badges, and diagrams are
  worth it only when they make the content faster to grasp. Never decorate — a
  busy page is harder to read, not easier.

- **Legible everywhere.** The page must read cleanly in light and dark mode and
  at any screen width. The user opens it wherever they open it.

- **Tell the user what to do next.** Surface the URL as a clickable markdown link
  with one line of instruction: what to click, and what happens after they do
  (you continue, the page loops, or it is just to view). Never leave the user
  guessing.

## Shared serve procedure

All three modes share one server lifecycle — pre-flight, temp dir, the three
server cycles, the `.port` + `fb-generation` contract, URL surfacing, and cleanup.
It is documented once in [references/serve.md](references/serve.md); each mode
reference points back to it.
