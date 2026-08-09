---
name: grill
description: "Grill a plan, design, or decision before committing to it."
when_to_use: "Use when open questions remain — decisions nobody has made, assumptions never put to the user — before the work is committed to. Triggers on 'grill', 'stress-test this plan'. Fits a knot of decisions, not a single clarification — ask that one directly."
argument-hint: "[what-to-grill]"
---

What to grill: $ARGUMENTS. If no argument is given, grill the plan, design, or work
currently under discussion.

Interview the user relentlessly until you reach a shared understanding. Map the target as a
**design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already
settled — the questions you can ask *now* without guessing at answers you have not heard yet. Ask
the whole frontier, then wait for the answers before recomputing it. Each round's answers reshape
the tree: settled decisions push the frontier outward and unblock the questions that depended on
them.

## Asking a round

Every question goes through the `AskUserQuestion` tool. Your own recommendation leads the
options, its `label` ending in `(Recommended)`.

- A frontier wider than one call goes out as back-to-back calls before you recompute — those
  calls are still one round.
- Each `header` names the decision its question settles ("Auth model", "Rollout").
- Each option is a design choice the user could commit to, and its `description` says what
  choosing it commits them to.
- Write both in ASD-STE100 Simplified Technical English, every identifier and abbreviation
  expanded — the user reads the picker cold.

An answer typed as prose — into the free-text field, or as a message — settles its decision as
firmly as a pick. Take it and recompute the frontier from it.

## Facts and decisions

Finding *facts* is your job, never the user's. When a frontier question turns on a fact from the
environment — the working tree, the git history, a tool's output — go and get it. Dispatch a
sub-agent for anything that takes real digging and keep asking the rest of the frontier while it
runs: a live exploration is an unsettled prerequisite, so only the questions downstream of it wait
for the answer. The *decisions* are the user's — put each one to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing
left silently assumed. Act on the plan once the user confirms you have reached a shared
understanding.
