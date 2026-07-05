# Lean systems principles operationalized

Use these principles as the constitutional source for every review.

## 1. Simplicity is non-negotiable
Prefer the simplest design that meets the current need.

Ask:
- What can be removed without loss of value?
- What special cases, layers, or options disappear in the simpler version?
- Does this make the system easier to understand and operate?

Flag:
- optionality without a current need
- additional branches, toggles, or configuration for hypothetical futures
- layers that mainly move complexity around rather than eliminate it

## 2. Earn every feature, abstraction, and dependency
Every feature, abstraction, and dependency must solve a present problem worth its cost.

Ask:
- What concrete pain does this solve now?
- What happens if we do not add this?
- Is this real leverage or speculative extensibility?

Flag:
- abstractions created before repeated need exists
- new dependencies added for convenience rather than necessity
- framework-shaped design where the tool is driving the problem framing

## 3. Understand the problem before reaching for solutions
Start from the domain model, data relationships, invariants, and constraints.

Ask:
- What is the core model?
- Are we designing around real domain relationships or implementation convenience?
- Is logic compensating for a weak model?

Flag:
- requirement or design discussions that jump to components before the core model is clear
- code that looks complicated because the underlying structure is wrong

## 4. Intellectual manageability
A competent engineer should be able to reason about the whole system or whole change.

Ask:
- How many moving parts must be kept in mind?
- How much hidden context or convention is required?
- Does this improve or reduce comprehensibility?

Flag:
- designs that depend on too many layers, hidden flows, or non-local rules
- changes that require large amounts of tribal knowledge to understand

## 5. Complexity: know your enemy
Distinguish essential complexity from accidental complexity.

Ask:
- Which parts are unavoidable because of the problem domain?
- Which parts are self-inflicted through tools, layers, or process?
- Are we reducing essential difficulty or merely adding accidental difficulty?

Flag:
- machinery that exists to support other machinery
- complexity added to hide rather than solve complexity

## 6. Efficiency is a design goal
Performance, memory use, and operational cost matter when they materially affect the system.

Ask:
- Is there a simpler design that is also cheaper to run and reason about?
- Does this introduce wasteful generality or overhead?
- Are we outsourcing discipline to future hardware or bigger infrastructure?

Flag:
- heavy machinery for light needs
- decomposition choices that cost more than they save

## 7. Code should be obvious, not clever
Prefer explicit, readable, locally understandable solutions.

Ask:
- Is the intent obvious?
- Is the logic smaller and clearer than the problem it solves?
- Would a competent engineer understand this without decoding tricks?

Flag:
- indirect control flow, magic behavior, meta-programming, or compressed cleverness without strong payoff

## 8. Don't break what works
Backward compatibility has a high burden of proof.

Ask:
- Does this break existing users, interfaces, workflows, or assumptions?
- Is the logic clear and focused on the problem it should solve?
- Is there a migration path or compatibility layer?

Flag:
- casual public contract changes
- simplifications that merely shift cost onto users

## 9. Rigor in review
Missing justification is itself a defect.

Ask:
- Is the reasoning explicit and testable?
- Are claims supported by constraints, evidence, or tradeoffs?
- Is the change careful enough to deserve trust?
- Are we mistaking polish, fluency, or confidence for sound reasoning?

Flag:
- hand-wavy rationale
- future-proofing with no concrete scenario
- changes whose purpose is not crisply stated

## 10. Good decisions require shared understanding
Alignment on goals and constraints should come before solution debate.

Ask:
- Do we share the same understanding of the goal?
- Are we arguing about solutions before aligning on the problem?
- Is missing context causing false disagreement?

Flag:
- plausible proposals built on unverified assumptions
- reviews where core terms or goals are still ambiguous

## 11. Discipline and a return to essentials
When complexity compounds, recommend simplification or redesign rather than patching a weak foundation.

Ask:
- Are we preserving a bad shape because it feels cheaper short-term?
- Would a smaller redesign reduce more future cost than another patch?
- What is the clean essential version of this?

Flag:
- layering new process or machinery onto a structurally weak approach
- treating symptom management as architectural progress

## Default burden of proof
If a change adds complexity, the burden of proof is on the change, not on the reviewer.
