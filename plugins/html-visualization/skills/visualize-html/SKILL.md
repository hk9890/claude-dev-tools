---
name: visualize-html
description: "This skill should be used when Claude is about to present a multi-section plan, a batch of decisions, or a set of open questions to the user (3 or more separately-numbered open questions, OR 3 or more approve/reject decision points); OR when the user wants to review a piece of existing content — a document, draft, article, plan write-up, or any prose — by marking it up with inline comments; OR when Claude is about to display a visualization, diagram, chart, or data summary that is better viewed in a browser than in chat. Triggers on phrases like 'I have several questions before proceeding', 'here is my plan — please review each section', 'let me present the options for your approval', 'can you send me an HTML form for this', 'show me this as HTML so I can comment on it', 'let me mark up this document', 'render this draft so I can annotate it', 'let me annotate this draft', 'show me a visualization of this', 'render this as a chart'. Does not apply when there are 2 or fewer questions, when a single yes/no answer is sufficient, when the user wants a fast in-chat back-and-forth, when the content is a short factual answer, or when Node.js is unavailable. When unsure, bias toward NOT triggering — ask in chat instead."
---

## What this skill does

Dispatch the request to one of three modes based on the free-text intent, then
load the matching mode reference:

| Mode | Intent | Reference |
|---|---|---|
| `ask` | Structured questions or approve/reject decisions for the user to answer | `references/ask.md` |
| `feedback` | Existing content the user wants to annotate or revise | `references/feedback.md` |
| `visualize` | A display-only visualization, diagram, or data summary | `references/visualize.md` |

All three modes share the same serve procedure (`references/serve.md`), which
documents the pre-flight, temp-dir, all three server cycles, the `.port` +
`fb-generation` contract, and cleanup.

---

## Intent classification and precedence

Read the free-text intent and classify it into exactly one mode. When the intent
is ambiguous, apply these rules in order:

1. **Questions to answer → ask** — if the intent contains specific questions or
   decision points the user must respond to (numbered questions, "should I",
   "which option", approve/reject), route to `ask` regardless of whether a
   document is also present.
2. **Existing content to revise/annotate → feedback** — if the intent is to show
   the user a piece of content (document, draft, article, notes) so they can mark
   it up, comment on it, or iterate on revisions, route to `feedback`.
3. **Otherwise → visualize** — if the intent is to display something (a diagram,
   chart, data summary, or any rich visual) without collecting structured answers
   or annotation feedback, route to `visualize`.

**Tie-break examples:**

- "Here are 5 questions about my plan" → `ask` (questions present, precedence 1)
- "I've written a draft — please show it so I can annotate it" → `feedback`
  (revision/annotation intent, precedence 2)
- "Show me a dependency graph of this codebase" → `visualize` (display-only,
  precedence 3)
- "Review this document and tell me if you have questions about the approach" →
  `feedback` (the user is asking Claude to review their content, so the natural
  output is a rendered page the user can annotate; if Claude's review generates 3+
  questions, route to `ask` instead)

When genuinely unsure after applying these rules, ask the user one clarifying
question in chat rather than guessing.

---

## Dispatch

After classifying the intent, load the matching reference file and follow it:

- **ask**: load `references/ask.md` — question form, blocking submit round-trip,
  verdict-based read-back
- **feedback**: load `references/feedback.md` — content annotation, Apply loop,
  re-serve on same port
- **visualize**: load `references/visualize.md` — display-only, non-blocking
  `--no-wait` serve

The shared server procedure for all three modes is in `references/serve.md`.
