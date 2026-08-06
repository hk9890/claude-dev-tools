---
name: writing-skills
description: "Reference for writing and editing skills well — the vocabulary and principles that make a skill predictable."
when_to_use: "Use when writing or revising a SKILL.md, or a file it bundles or shares — under references/, scripts/, assets/, or a plugin-root references/ two skills reach. Triggers on 'SKILL.md', 'write a skill', 'skill description'. Also loaded by name when another skill needs the rubric. Not for a project's own docs — AGENTS.md, README.md, docs/ guides (`writing-project-docs`) — nor for task and issue bodies (`tasks:tasks-writing`)."
argument-hint: "[skill-path-or-request]"
---

A skill wrangles determinism out of a stochastic system. **Predictability** — the agent taking the same _process_ every run, not producing the same output (a brainstorming skill should _predictably_ diverge: its tokens vary, its behaviour does not) — is the root virtue every lever below serves.

**What to write or review:** $ARGUMENTS — a skill path, a draft, or a request; with no argument, the
skill under discussion. Hold every rule below against it and either clear it or name it as a
defect. Reading the rubric is not the work.

## The two loads

Every skill spends one of two budgets:

- **Context load** — always-loaded material on the agent's window: a **description**, spending tokens and attention every turn whether or not the skill fires.
- **Cognitive load** — the cost on the human: which skills exist, and when to reach for each. The human is the index. Not a cost to minimise — it is the price of human agency; spend it where human judgement matters, remove it where it does not.

## Invocation

Two choices, each spending one of the loads:

- **Model-invoked** — keeps a description the agent can see, so the agent can fire the skill and other skills can reach it; you can still type its name, since model-invocation always _includes_ user reach. Pays permanent context load. Mechanics: omit `disable-model-invocation`, and write a model-facing description carrying the trigger branches.
- **User-invoked** — puts the description out of the agent's reach: only the human typing its name can invoke it, and no other skill can. Zero context load, spends cognitive load. Mechanics: set `disable-model-invocation: true`; the `description` field stays but turns human-facing — a one-line summary, trigger lists stripped.

Pick model-invocation only where the agent must reach the skill on its own, or another skill must.

Reference that several skills need has two homes. A model-invoked skill of pure reference is one, since any skill can invoke it — but it only works where the sibling _is_ the reference, because invoking it loads its whole body, and it buys that reach with a description loaded in every session. Weigh that against how much is shared: a few hundred words rarely earns permanent context load. Otherwise — and always between two **user-invoked** skills, which have no agent-visible description and so cannot fire each other — push it to **external reference**: a plain file outside the skill system that any skill points at.

When user-invoked skills multiply past what you can remember, that cognitive load is cured by a **router skill**: one user-invoked skill naming the others and when to reach for each. It can only hint, never fire them.

## Writing the description

A **context pointer** names out-of-context material and encodes the condition for reaching it. A description is the top-level one (context window → skill); a pointer to a disclosed file is the same object one level down. The pointer's _wording_, not its target, decides when the agent reaches the material and how reliably — so a must-have target behind a weak pointer is a variance bug: sharpen the wording first, and inline the material only if that fails.

A description does two jobs: state what the skill is, and list the **branches** that should trigger it. Every word costs on every turn, so it earns harder pruning than the body.

- **Front-load the skill's leading word** — the description is where it does its invocation work.
- **One trigger per branch.** Synonyms that rename a single branch are one branch written twice — "build features using TDD … asks for test-first development". Collapse them.
- **Cut identity the body already carries.** Triggers, plus any "when another skill needs…" reach clause.

## Information hierarchy

A skill mixes two content types: **steps**, the ordered actions the agent performs, and **reference**, the definitions and rules it consults on demand. A skill can be all steps (`tdd`), all reference (a review), or both. The decision is where each piece sits on the **information hierarchy**, a ladder ranked by how immediately the agent needs it:

1. **In-skill step** — the primary tier: what the agent does, in order.
2. **In-skill reference** — consulted on demand. Often a legitimately flat peer-set (every rule of a review on one rung), which is a fine arrangement rather than a smell.
3. **Disclosed reference** — pushed out of `SKILL.md` into a file in the skill folder, reached by a **context pointer** and loaded only when that pointer fires.
4. **External reference** — a plain file outside the skill system that any skill can point at.

Push too little down and the top bloats; push too much and you hide material the agent needs.

**Progressive disclosure** is the move down the ladder, so the top stays legible. A **branch** is a distinct way a skill can be invoked, so different runs take different paths through it — and branching is the disclosure test: inline what every branch needs, push behind a pointer what only some branches reach. Where a skill has steps, in-skill reference that should be disclosed buries them and turns attending to them into a coin-flip.

**Co-location** decides what sits beside a piece once the ladder has placed it: keep a concept's definition, rules and caveats under one heading rather than scattered, so reading one part brings its neighbours with it.

**Sprawl** is the failure mode here: a skill too long even when every line is live and unique, so attention thins across the excess. The cure is the ladder — disclose reference behind pointers, and split by branch or sequence so each path carries only what it needs.

## Steps and completion criteria

Every step ends on a **completion criterion**, the condition telling the agent the work is done. Two properties make it a lever:

- **Clarity** — can the agent tell done from not-done? A vague bound ("understanding reached") invites **premature completion**: ending a step before it is genuinely done, attention slipping to _being done_. The visible steps still ahead — the **post-completion steps** — supply the pull; clarity is the resistance. Sharpen the bound first, since that is local and cheap. Only where it is irreducibly fuzzy _and_ you observe the rush, hide the later steps by splitting the sequence — and hiding works only across a real context boundary: a **user-invoked** hand-off, or a subagent dispatch. An inline **model-invoked** call leaves the later steps in context and clears nothing.
- **Demand** — how much it requires. "Every modified model accounted for" forces thorough work where "produce a change list" does not. Demand drives **legwork**, the digging the agent does inside the work, latent in the wording rather than written as its own step. It is not step-bound: "every rule applied" binds flat reference as "every step done" binds a sequence.

The strongest criteria are both checkable and exhaustive.

## When to split

**Granularity** is how finely you divide skills, and each cut spends one of the two loads, so split only where the cut earns it:

- **By invocation** — split off a model-invoked skill where a distinct **leading word** should trigger it on its own, a word you actually use in your prompts, or where another skill must reach it.
- **By sequence** — split a run of steps where the post-completion steps tempt the agent to rush the one in front of it. Merging sequences does the reverse: it exposes each step's later steps to what follows, inviting premature completion.

## Leading words

A **leading word** is a compact concept already in the model's pretraining that the agent thinks with while running the skill (_lesson_, _fog of war_, _tracer bullets_). Repeated as a token, never as a sentence, it accumulates a distributed definition and anchors a whole region of behaviour by recruiting priors the model already holds. Coining your own works if you define it clearly, but a made-up word recruits no priors — reach for an existing word first.

It anchors twice. In the body, _execution_: the agent reaches for the same behaviour every time the word appears, and inside flat reference it focuses attention on a class of thing to look for. In the description, _invocation_: when the same word lives in your prompts, your docs and your codebase, the agent links that shared language to the skill and fires it more reliably.

A triad spelled out at three sites, a description spending a sentence to gesture at one idea — each is a passage begging to collapse into a single token:

- "fast, deterministic, low-overhead" → _tight_ (a _tight_ loop).
- "a loop you believe in" → _red_ — a fuzzy gate becomes a binary observable state.

Assume every skill carries restatements that leading words retire, and go find them. A leading word is the deliberate inverse of **duplication**: it repeats a token on purpose, never the meaning.

**Negation** — steering by prohibition — is the failure mode beside this lever, defined with the shared rules below.

## Pruning

Single source of truth, cache, relevance, sediment, no-ops and negation bind any document an agent reads, so they are shared with `writing-project-docs` and live at the **plugin root** — the `../../` is the layout, not a mistake:

[`../../references/writing-hygiene.md`](../../references/writing-hygiene.md), at `<base directory for this skill>/../../references/`

Apply every rule in it to the target.
