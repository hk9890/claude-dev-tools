# Requirements review workflow

Use this workflow when reviewing feature requests, scope proposals, product requirements, or acceptance criteria.

## Review goal
Determine whether the requested scope is essential, minimal, and aligned with the real problem.

## Review sequence

1. State the user need or business need in one or two sentences.
2. Separate the core outcome from proposed solution details.
3. Identify the minimal shippable scope that would still deliver value.
4. List explicit non-goals and likely featurism.
5. Challenge speculative flexibility, optionality, and edge-case expansion.
6. Decide whether the requirement set should be reduced, deferred, clarified, or accepted.

## Questions to ask

- What problem is truly being solved?
- Which requirement is essential and which is merely attractive?
- What is the smallest version that would still matter?
- Which items exist to satisfy hypothetical future needs rather than current needs?
- What assumptions about users, scale, or future variants are being smuggled in?

## Typical smells

- multiple modes before one mode has proven value
- configuration added to avoid making a decision
- while-we-are-here scope growth
- requirements written in terms of solution components instead of outcomes
- acceptance criteria that reward completeness over necessity

## Preferred recommendation order
When possible, recommend in this order:
1. remove
2. defer
3. narrow
4. simplify
5. accept

## Output emphasis
These items supplement the shared output skeleton defined in the `project-reviewer` agent (Verdict, Principle pressure points, Findings, Open questions, Recommended actions); all mandatory sections still apply.

The review must explicitly include:
- the minimal acceptable scope
- the non-goals that should stay out
- the top sources of accidental complexity in the requirement set
