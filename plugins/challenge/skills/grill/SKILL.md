---
name: grill
description: "Grill the user relentlessly about a plan or design — one question at a time, each with a recommended answer, until you reach a shared understanding."
when_to_use: "Use when the user wants a plan, design, change, decision, or idea challenged before committing — 'grill me on this', 'poke holes in this', 'challenge this plan', 'stress-test this approach', 'what am I missing?', 'talk me out of this'. Produces an interactive question-by-question walkthrough, not a written report. Not a code/PR or whole-project audit — for those, use the project-review reviews."
argument-hint: "[what-to-grill]"
---

<!-- Adapted from https://github.com/mattpocock/skills (MIT), Copyright (c) Matt Pocock. -->

What to grill: $ARGUMENTS. If no argument is given, grill the plan, design, or work
currently under discussion.

Interview me relentlessly about every aspect of this plan until we reach a shared
understanding. Walk down each branch of the design tree, resolving dependencies between
decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.
Asking multiple questions at once is bewildering.

If a *fact* can be found by exploring the codebase, look it up rather than asking me. The
*decisions*, though, are mine — put each one to me and wait for my answer.

Do not enact the plan until I confirm we have reached a shared understanding.
