---
name: grill
description: "Grill a plan, design, or decision before committing to it."
user-invocable: true
disable-model-invocation: true
argument-hint: "[what-to-grill]"
---

What to grill: $ARGUMENTS. If no argument is given, grill the plan, design, or work
currently under discussion.

Interview the user relentlessly until you reach a shared understanding. Map the target as a
**design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already
settled — the questions you can ask *now* without guessing at answers you have not heard yet. Put
the frontier to the user, then wait for the answers before recomputing it. A question whose answer
depends on another question still open in this round belongs to a later round. Each round's
answers reshape the tree: settled decisions push the frontier outward and unblock the questions
that depended on them.

## The cold reader

Write every question for a **cold reader**: a user who comes back from other sessions and holds
none of this one in mind. The goal is a decision the user understands, not a decision the user
approves. A question restates the background it rests on: never "as discussed above", never an
earlier question's number without what that question settled. Expand every identifier and
abbreviation, and write in ASD-STE100 Simplified Technical English.

Every question carries your recommendation: what you recommend, why, and what it costs us.

## Simple and complex questions

A question is **simple** where a cold reader can decide it from the question text alone: the
options explain themselves, and the effect of each stays local and is easy to undo. Every other
question is **complex**. Where you are not sure, it is complex.

**Simple** questions go through the `AskUserQuestion` tool, several to a call.

- Max 4 questions, 4 options, 12-char `header`; more options, prose.
- More than four simple questions go out as back-to-back calls, still one round.
- Each `header` names the decision its question settles ("Auth model", "Rollout").
- Your recommendation leads the options, its `label` ending in `(Recommended)`, its
  `description` saying why and what it costs. Each other `description` says what choosing that
  option commits us to.

**Complex** questions go out as prose, as many to a message as a cold reader can weigh with
care, often one. Each takes this shape:

```
**Q<n>: <the decision, in one line>**

<The background: the facts the decision rests on, each with where you found it, and the later
decisions that hang on it.>

- **<option>**: what it commits us to, what it costs, and what it rules out later.

**Recommendation: <option>.** Why, what it costs us, and what would change your mind.
```

In a round with both kinds, write the prose questions first, then make the `AskUserQuestion`
call.

## Answers and discussion

An answer in the user's own words — typed into the free-text field the tool puts on every
question, or as a message — settles its decision as firmly as a pick. Take it and recompute the
frontier from it. Where the premise may be wrong — the call is not the user's, or is not a call at
all — say so: in prose, or with one option of the picker.

A request for more ("why", "explain", "what does this break", "let's discuss this") is not an
answer. Give the deeper background and consequences it asks for, then put the same decision
again, in prose. A simple question asked that way has become complex. The discussion ends when the
user decides, not when you think the question is clear.

## Facts and decisions

Finding *facts* is your job, never the user's. When a frontier question turns on a fact from the
environment — the working tree, the git history, a tool's output — go and get it. Dispatch a
sub-agent for anything that takes real digging and keep asking the rest of the frontier while it
runs: a live exploration is an unsettled prerequisite, so only the questions downstream of it wait
for the answer. The *decisions* are the user's — put each one to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing
left silently assumed. Act on the plan once the user confirms you have reached a shared
understanding.
