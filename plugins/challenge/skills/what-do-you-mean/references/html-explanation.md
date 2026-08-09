# The explanation page

The brief for an explanation rendered as a browser page, reached when 400 words of chat
could not carry the point.

`html-visualize-feedback` owns the mechanics — the HTML, the serving, the Apply loop and
the visual rules. This file owns what an *explanation* must contain, how it is cut into
blocks, and what applying a comment means when the content is an explanation. Follow both.

Feedback mode is the right surface because an explanation that lands halfway leaves
questions, and this one lets the user put each question on the exact sentence that raised
it. The page is a document to mark up: every part of it is somewhere the user can put a
question.

## What carries over

Every rule of the re-pitch still binds every word on the page: context before the point,
ASD-STE100 Simplified Technical English, the project's own ubiquitous language, and every
name resolved in place. More room is not a different register.

What lifts is the 400-word cap — for the page as a whole, not for the top of it.

## Layers

The page is the same re-pitch in layers, so the reader stops as soon as it lands:

1. **The answer** — the point in one or two sentences, above everything else. A reader who
   stops here has what the chat message failed to deliver.
2. **The re-pitch** — the 400 words the chat already carried, unchanged, under the answer.
3. **What the cap cost** — the points the closing line named as dropped, one section each.
   This is the reason the page exists; give it the most room.
4. **The names** — a two-column table of every label this conversation has used against
   what it actually is: `option A` → the shared-database option, `#412` → the ticket about
   the login timeout. Chat could not afford this table, and it is what lets the rest of the
   page be read without leaving it.

## One claim per block

A comment attaches to a block, so the block breakdown decides how precisely the user can
point at what still does not land. Cut the page finer than you would cut prose: one claim
per block, each standing on its own, so a question about the second half of a paragraph
does not arrive attached to the first half as well.

Say so in the subtitle — the page asks for the parts that still do not land, and every
block is a place to say it.

## An Apply round answers by rewriting

A comment on an explanation is a question. Answering it in chat leaves the page still
wrong, so apply it where it landed: rewrite that block until the question could not arise
from it, then re-render. The user is done when nothing is left to ask, and the page they
finish on is one that would have landed the first time.

## Structure goes in a table, not a picture

Feedback mode renders ordinary semantic HTML — headings, paragraphs, lists, tables,
`<blockquote>`, `<pre><code>` — and carries no diagram integration. A comment anchors to
selected text, so a picture is the one thing on the page the user cannot ask a question
about.

Where the confusion is structural — how things connect, what order they happen in, which
layer a thing lives in — carry it in a table or an ordered list, one row per relation.
Both hold selectable text, so every part of the structure stays something the user can
point at.

## Done when

Every question the user attached is answered inside the page rather than beside it, and
every label in it resolves without leaving the page.
