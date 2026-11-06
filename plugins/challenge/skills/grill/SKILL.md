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
the frontier to the user, and recompute it after each answer, before you ask anything further: a
question not yet asked may change or drop out. A question whose answer depends on another question
still open belongs to a later round: a recommendation that reads "if Q1 is X", or a "what would
change your mind" that names another open question, is the symptom. Each answer reshapes the tree:
settled decisions push the frontier outward and unblock the questions that depended on them.

## The cold reader

Write every question for a **cold reader**: a user who comes back from other sessions and holds
none of this one in mind. The goal is a decision the user understands, not only one the user
approves.

Until the user confirms the shared understanding, each message to the user holds questions and
nothing else. It opens with the first question, and a remark goes inside the question it bears
on. Each question carries the background it rests on: its facts, each with its source, and the
earlier answers it builds on, restated in this message. A fact no question in the message rests
on stays out. Follow each identifier (a file path, a task id, a commit hash, a skill or check
name) with what it is, and expand each abbreviation, the user's own (BLUF, YAGNI) included; a
picker `header` may stay short. Write in ASD-STE100 Simplified Technical English.

One decision per question: a choice hidden inside an option, or two options that share a first
choice and differ in a second, is a question of its own. Each option is a choice the user could
commit to, and says what it commits us to, what it costs, and what it rules out later, where it
rules out anything. Each decision carries your **recommendation**: one option, why, what it costs
us, and what would change your mind. A question about the user's own goal or situation carries
your **best read** of it instead: the answer you think is true, marked as a guess, with what you
read it from, and what each answer would change. Such a question is always complex.

Where a question's premise may be wrong — the call is not the user's, or is not a call at all —
say so inside that question: in prose, or with one option of the picker.

## Simple and complex questions

A question is **simple** where a cold reader can decide it from the picker alone — its `question`
field needs at most two sentences of background, and its options explain themselves — and the
effect of each option stays inside what is being grilled and is easy to undo. Every other question
is **complex**. Where you are not sure, it is complex.

**Simple** questions go through the `AskUserQuestion` tool, several to a call; where that tool is
not available, they go out as prose too.

- Max 4 questions, 4 options, 12-char `header`; more options, prose.
- More than four simple questions go out as back-to-back calls, still one round.
- Each `header` names the decision its question settles ("Auth model", "Rollout").
- Your recommendation leads the options, its `label` ending in `(Recommended)`. Each
  `description` says what choosing that option commits us to; the recommended one adds why, what
  it costs, and what would change your mind.

**Complex** questions go out as prose, as many to a message as a cold reader can weigh with
care: usually one, more only where each is short. Each takes this shape:

```
**Q<n>: <the decision, in one line>**

<The background: the facts the decision rests on, and the later decisions that hang on it.>

- **<option>**: what it commits us to, what it costs, and what it rules out later.

**Recommendation: <one option's label, exactly>.** Why, what it costs us, and what would change
your mind.
```

A question about the user's goal or situation ends on
`**Best read (a guess, from <source>): <one option's label, exactly>.**` in place of the
recommendation.

In a round with both kinds, make the `AskUserQuestion` call first, then write the prose questions
once it returns.

## Answers and discussion

An answer in the user's own words — typed into the free-text field the tool puts on every
question, or as a message — settles its decision as firmly as a pick. An answer that hands the
decision to you ("your call", "go with your recommendation") settles it on your recommendation.
Take it and recompute the frontier from it.

A request for more ("why", "explain", "what does this break", "let's discuss this") is not an
answer. Put the same decision again, in prose, with the deeper background and consequences it
asks for inside it. A simple question asked that way has become complex. The discussion ends when
the user decides, not when you think the question is clear.

## Facts and decisions

Finding *facts* is your job, never the user's. When a frontier question turns on a fact from the
environment — the working tree, the git history, the project's hosting such as GitHub, a tool's
output — go and get it, and ask the user only for the part no source can show. Check each fact
before you put a question that rests on it. Dispatch a sub-agent for anything that takes real
digging and keep asking the rest of the frontier while it runs: a question waits for it only where
an option in that question rests on a fact it can change. When it reports while questions are
open, put again in full each open question its facts change, with them inside, and add the
questions they unblock. The *decisions* are the user's — put each one to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing
left silently assumed. Act on the plan once the user confirms you have reached a shared
understanding.
