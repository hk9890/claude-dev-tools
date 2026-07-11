# Requirements analysis

Use when the target is a feature request, scope proposal, product requirement, or acceptance criteria.

## Goal
Determine whether the requested scope is essential, minimal, and aligned with the real problem.

## Sequence

1. State the user need or business need in one or two sentences.
2. Separate the core outcome from proposed solution details.
3. Identify the minimal shippable scope that would still deliver value.
4. List explicit non-goals and likely **creeping featurism**.
5. Challenge speculative flexibility, optionality, and edge-case expansion — **YAGNI**.
6. Decide whether the requirement set should be reduced, deferred, clarified, or accepted.

## Questions to ask

- What problem is truly being solved?
- Which requirement is a **must-be** and which is merely **attractive** (Kano)?
- What is the smallest version that would still matter?
- Which items exist to satisfy hypothetical future needs rather than current needs?
- What assumptions about users, scale, or future variants are being smuggled in?

## Typical smells

- multiple modes before one mode has proven value
- configuration added to avoid making a decision
- **scope creep**: while-we-are-here growth; **gold plating**: polish nobody asked for
- requirements written in terms of solution components instead of outcomes
- acceptance criteria that reward completeness over necessity — **worse is better**

## Preferred recommendation order
When possible, recommend in this order:
1. remove
2. defer
3. narrow
4. simplify
5. accept

## Terms
**YAGNI** — Extreme Programming (Beck, Jeffries). **Kano model** — Noriaki Kano: *must-be* quality
(absence angers) vs *attractive* quality (presence delights). **Worse is better** — Richard P.
Gabriel, *The Rise of Worse Is Better*: simplicity of implementation beats completeness.
**Creeping featurism** — Jargon File. **Scope creep**, **gold plating** — standard project
anti-patterns.
