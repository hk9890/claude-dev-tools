# Critical-engineering value base

The constitutional source a grill argues from. When a project doc settles a question,
that doc wins. When none does, these values break the tie — and a recommended answer
that contradicts one of them is a finding, not a preference.

Two families: the **simplicity** values (is this worth its cost?) and the **risk**
values (what happens when it is wrong?). A critical grill presses on both.

> Provenance: the simplicity values (1–6) are paraphrased and condensed from
> `project-quality`'s `project-review-complexity/references/principles.md` (a 6-of-11
> subset). Kept as a separate file because plugins install independently — a reword
> there will not propagate here, so keep the two conceptually aligned when either changes.

## Simplicity values

### 1. Simplicity is non-negotiable
Prefer the simplest design that meets the present need.
Press on: What can be removed without loss? What special cases, layers, or options
vanish in the simpler version? Is optionality being added for a future that may not come?

### 2. Earn every feature, abstraction, and dependency
Each one must solve a present problem worth its cost.
Press on: What concrete pain does this solve now? What happens if we do not add it? Is
this real leverage or speculative extensibility? Is a new dependency a necessity or a
convenience?

### 3. Understand the problem before the solution
Start from the domain model, the data, the invariants — not the components.
Press on: What is the core model? Are we designing around real relationships or
implementation convenience? Is logic compensating for a weak model?

### 4. Intellectual manageability
A competent engineer should be able to hold the whole change in mind.
Press on: How many moving parts must be kept in mind at once? How much hidden context
or convention is required? Does this raise or lower comprehensibility?

### 5. Know essential from accidental complexity
Press on: Which difficulty is forced by the problem, and which is self-inflicted by
tools, layers, or process? Is this reducing essential difficulty or merely adding
accidental difficulty?

### 6. Obvious, not clever
Prefer explicit, locally understandable solutions.
Press on: Is the intent obvious without decoding? Is the logic smaller and clearer than
the problem it solves? Is there indirection or magic without a strong payoff?

## Risk values

### 7. Failure modes and blast radius
Every critical change must answer how it fails, not just how it works.
Press on: What breaks when this fails? Who is affected, and how widely? What is the
worst-case blast radius, and is it contained? Which dependency-failure path is untested?

### 8. Reversibility
A hard-to-reverse decision carries a higher burden of proof than a reversible one.
Press on: Can this be undone cheaply if it is wrong? Is this a one-way door? If so, what
evidence justifies walking through it now rather than deferring?

### 9. Testable success criteria
A plan whose success cannot be observed cannot be verified — vague criteria is always a
blocking question.
Press on: How will we know this worked? Is each success criterion observable and
falsifiable, or is it a feeling? What is the concrete acceptance check?

### 10. Surface the hidden assumptions
Press on: What must be true for this to work that no one has stated? Which assumption,
if false, collapses the plan? Are we treating a guess as a fact?

### 11. Scope, dependencies, and ordering
Press on: Is anything in scope that could be deferred or dropped? Is anything out of
scope that is actually required? Do the steps depend on each other in the order given,
or does step 3 secretly need step 5 first?

### 12. Do not break what works
Backward compatibility has a high burden of proof.
Press on: Does this break existing users, interfaces, or assumptions? Is there a
migration path? Is a simplification merely shifting cost onto users?

## Default burden of proof

The burden is on the change, the abstraction, the new dependency, and the one-way door
— never on the person questioning them. Missing justification is itself a finding.
