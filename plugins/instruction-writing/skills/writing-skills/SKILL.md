---
name: writing-skills
description: "Reference for writing and editing skills well — the vocabulary and principles that make a skill predictable."
when_to_use: "Use when writing or revising a SKILL.md, or a file it bundles under references/, scripts/, or assets/. Triggers on 'SKILL.md', 'write a skill', 'skill description'. Also loaded by name when another skill needs the rubric. Not for a project's own docs — AGENTS.md, README.md, docs/ guides (`writing-project-docs`) — nor for task and issue bodies (`tasks:tasks-writing`)."
argument-hint: "[skill-path-or-request]"
---

A skill exists to wrangle determinism out of a stochastic system. **Predictability** — the agent taking the same _process_ every run, not producing the same output (a brainstorming skill should _predictably_ diverge: its tokens vary, its behaviour does not) — is the root virtue every lever below serves. Cost and maintainability are symptoms of it, not rivals.

**What to write or review:** $ARGUMENTS — a skill path, a draft, or a request; with no argument, the
skill under discussion. Apply every rule below to it. The work is done when each one has been held
against that target and either cleared or named as a defect — not when the rubric has been read.

## The two loads

Every skill you add spends one of two budgets, and the pair is the brake on almost every decision below:

- **Context load** — the cost of always-loaded material on the agent's window: a **description**, sitting there every turn, spending tokens and attention whether or not the skill fires.
- **Cognitive load** — the cost on the human: which skills exist and when to reach for each. The human is the index. Not a cost to minimise — it is the price of human agency; spend it where human judgement matters, remove it where it does not.

## Invocation

Two choices, each spending one of the loads:

- A **model-invoked** skill keeps a description the agent can see, so it can fire the skill autonomously _and_ other skills can reach it — and you can still type its name, because model-invocation always _includes_ user reach. There is no model-only state: a description only ever _adds_ agent discovery, never removes the human's. It pays permanent **context load** for that discoverability. A model-invoked skill whose content is all **reference** is also one home for shared reference: another skill can invoke it, so reference several skills need lives in one place. Mechanics: omit `disable-model-invocation`, and write a model-facing description carrying the trigger branches.
- A **user-invoked** skill puts its description out of the agent's reach: only you, typing its name, can invoke it — and no other skill can. Zero context load, but it spends **cognitive load**. Mechanics: set `disable-model-invocation: true`; the `description` field stays but becomes human-facing — a one-line summary, trigger lists stripped.

Pick model-invocation only when the agent must reach the skill on its own, or another skill must. If it only ever fires by hand, make it user-invoked and pay no context load.

Shared reference two **user-invoked** skills both need can live in neither — with no agent-visible description, neither can fire the other. Push it to **external reference**: a plain file outside the skill system that any skill can point at.

When user-invoked skills multiply past what you can remember, that piled-up cognitive load is cured by a **router skill**: one user-invoked skill that names the others and when to reach for each, so the human has one skill to remember instead of many. It can only hint, never fire them.

## Writing the description

A **context pointer** is a reference held in the agent's context that names some out-of-context material and encodes the condition for reaching it. A model-invoked skill's description is the top-level one (context window → skill); a pointer to a disclosed file is the same object one level down. The pointer's _wording_, not its target, decides when the agent reaches the material — and how reliably. A must-have target behind a weakly worded pointer is a variance bug: sharpen the wording first, and inline the material only if sharpening fails.

A description does two jobs — state what the skill is, and list the **branches** that should trigger it. Every word costs on every turn, so it earns even harder pruning than the body:

- **Front-load the skill's leading word** — the description is where it does its invocation work.
- **One trigger per branch.** Synonyms that rename a single branch are **duplication** — "build features using TDD … asks for test-first development" is one branch written twice. Collapse them; keep only genuinely distinct branches.
- **Cut identity the body already carries.** Keep it to triggers, plus any "when another skill needs…" reach clause.

## Information hierarchy

A skill is built from two content types that mix freely — **steps**, the ordered actions the agent performs, and **reference**, the definitions, rules, and facts it consults on demand. A skill can be all steps (`tdd`), all reference (a review, or this skill), or both, independent of how it is invoked. The core decision is where each piece sits on the **information hierarchy**, a ladder ranked by how immediately the agent needs the material:

1. **In-skill step** — the primary tier: what the agent does, in order.
2. **In-skill reference** — consulted on demand. Often a legitimately flat peer-set (every rule of a review on one rung) — a fine arrangement, not a smell.
3. **Disclosed reference** — pushed out of `SKILL.md` into a separate file in the skill folder, reached by a **context pointer** and loaded only when that pointer fires.
4. **External reference** — a plain file outside the skill system, no description and not invocable, that any skill can point at.

Push too little down and the top bloats; push too much and you hide material the agent actually needs. That tension is the whole decision.

**Progressive disclosure** is the move down the ladder — out of `SKILL.md` and behind a pointer — so the top stays legible. Not primarily a token optimisation: it is how the hierarchy is protected. A **branch** is a distinct way a skill can be invoked, a case it handles, so different runs take different paths through it — and branching is the cleanest disclosure test: inline what every branch needs, and push behind a pointer what only some branches reach. When a skill has steps, in-skill reference that should be disclosed buries them and turns attending to them into a coin-flip — a variance lever, not just a legibility one.

**Co-location** is the within-file companion: where the ladder decides _how far down_ a piece sits, co-location decides _what sits beside it_ once there. Keep a concept's definition, rules, and caveats under one heading rather than scattered, so reading one part brings its neighbours with it. The test: the skill should read like documentation written for the agent — grouped material reads that way, scattered material does not. (Distinct from duplication: that repeats one meaning in two places; scattering fragments one meaning across many.)

**Sprawl** is the failure mode here: a skill simply too long, even when every line is live and unique. The agent wades through more before it can act, attention thins across the excess, and every extra line is one more to keep relevant. The cure is the ladder: disclose reference behind pointers, and split by branch or sequence so each path carries only what it needs.

## Steps and completion criteria

Every step ends on a **completion criterion** — the condition that tells the agent the work is done. Two properties make it a lever:

- **Clarity** — can the agent tell done from not-done? A vague bound ("understanding reached") invites **premature completion**: ending a step before it is genuinely done, attention slipping to _being done_ rather than to the work. The visible steps still ahead — the **post-completion steps** — supply the pull; the criterion's clarity is the resistance. Defend in order: **sharpen the bound first**, since that is local and cheap; only if it is irreducibly fuzzy _and_ you observe the rush, hide the later steps by splitting the sequence — and hiding only works across a real context boundary (a user-invoked hand-off or a subagent dispatch; an inline model-invoked call leaves the later steps in context and clears nothing).
- **Demand** — how much it requires. "Every modified model accounted for" forces thorough work where "produce a change list" does not. Demand drives **legwork** — the digging the agent does within the work, never written as its own step, latent in the wording — and it is not step-bound: "every rule applied" binds a body of flat reference just as "every step done" binds a sequence, which is how a skill of pure reference still carries an exhaustiveness bar.

The strongest criteria are both checkable and exhaustive.

## When to split

**Granularity** is how finely you divide skills, and each cut spends one of the two loads, so split only when the cut earns it:

- **By invocation** — split off a model-invoked skill when you have a distinct **leading word** that should trigger it on its own (a trigger word you actually use in your prompts), or another skill must reach it. You pay context load for the new always-loaded description, so that independent reach has to be worth it.
- **By sequence** — split a run of steps where the post-completion steps tempt the agent to rush the one in front of it. Keeping them out of view drives more legwork on the current task. Beware the reverse: merging sequences exposes each step's later steps to what follows, inviting premature completion.

## Leading words

A **leading word** is a compact concept already living in the model's pretraining that the agent thinks with while running the skill (_lesson_, _fog of war_, _tracer bullets_). Repeated as a token, never as a sentence, it accumulates a distributed definition across the skill and anchors a whole region of behaviour in the fewest tokens, by recruiting priors the model already holds. Coining your own works if you define it clearly, but a made-up word recruits no priors — you pay in definition tokens what a pretrained word gives free; reach for an existing word first.

It anchors twice. In the body, _execution_: the agent reaches for the same behaviour every time the word appears, and inside flat reference it focuses attention on a class of thing to look for. In the description, _invocation_: when the same word lives in your prompts, your docs, and your codebase, the agent links that shared language to the skill and fires it more reliably.

Hunt for opportunities to refactor skills to use leading words. A triad spelled out at three sites, a description spending a sentence to gesture at one idea — each is a passage begging to collapse into a single token:

- "fast, deterministic, low-overhead" → _tight_ (a _tight_ loop).
- "a loop you believe in" → _red_ — a fuzzy gate becomes a binary observable state (the loop goes _red_ on the bug, or it doesn't).

You win twice: fewer tokens, and a sharper hook for the agent to hang its thinking on. Assume every skill is carrying restatements that leading words retire — go find them.

**Negation** is the failure mode beside this lever: steering by prohibition drags the forbidden behaviour into context and makes it _more_ available, not less. _Don't think of an elephant_, and the elephant is all there is; the negation is a weak modifier the strongly-activated concept overruns, so the ban half-reads as an instruction to do the thing. Prompt the **positive** — state the target behaviour ("write one-line comments") so the banned one is never spoken. A prohibition earns its place only as a hard guardrail you cannot phrase positively; even then, pair it with the positive target so attention lands on what to do.

## Pruning

- Keep each meaning in a **single source of truth**: one authoritative place, so changing the skill's behaviour is a one-place edit. **Duplication** — the same meaning in more than one place — costs maintenance and tokens, and inflates a meaning's prominence on the ladder past its real rank. (The accidental inverse of a leading word, which repeats a token on purpose, never the meaning.)
- The **environment** is a source of truth too — `package.json` scripts, config files, the directory layout, `--help` output — and a skill that restates it is a **cache**: a copy of a lookup, earning its load only when the lookup is expensive. Cache what the agent cannot find by looking: the unwritten convention, the reason behind a choice, the gotcha no config confesses. Leave the one-file, one-command lookups to the environment, where they cannot go stale.
- Check every line for **relevance**: does it still bear on what the skill does? A line loses relevance by never bearing on the task (mere exposition, or a branch that should be disclosed) or by going stale as the behaviour or world it describes changes. Shorter skills are easier to keep relevant. Without a pruning discipline the default fate is **sediment**: stale layers that settle because adding feels safe and removing feels risky, until you must core down through them to find what is still live.
- Hunt **no-ops** sentence by sentence: an instruction the model already obeys by default pays load to say nothing. The test — does it change behaviour versus the default? — is model-relative, not reader-relative: two people disagreeing about a no-op disagree about the default, and settle it by running the skill, not by debate. When a sentence fails, delete the whole sentence rather than trim words from it. The test also grades leading words: a word too weak to beat the default (_be thorough_ when the agent is already thorough-ish) is a no-op, and the fix is a stronger word (_relentless_), not a different technique.
