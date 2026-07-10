# Architecture review workflow

Use this workflow when reviewing designs, component structures, dependency choices, service boundaries, integration plans, or broader architectural proposals.

## Review goal
Judge whether the design reduces the real problem to an intellectually manageable shape without introducing unnecessary machinery.

## Review sequence

1. Name the core model: entities, relationships, invariants, and main flows.
2. Distinguish essential complexity from accidental complexity.
3. Identify every new layer, boundary, abstraction, dependency, and operational concern.
4. Test whether each one has earned its place.
5. Ask whether a smaller, flatter, more direct design would work.
6. Judge compatibility risk, operational risk, and comprehension cost.

## Questions to ask

- What is the stable core model of the system?
- Which moving parts are essential, and which are self-inflicted?
- Can one competent engineer still reason about the whole design?
- Does this abstraction hide complexity or merely relocate it?
- Is decomposition reducing risk, or is it creating communication and coordination tax?
- Are we introducing a dependency or framework because it is truly justified, or because it is fashionable or convenient?

## Typical smells

- architecture driven by tools rather than domain needs
- speculative layers for future reuse
- decomposition with unclear ownership or weak boundaries
- indirection that obscures the main execution path
- designs that require many concepts before the core use case is understandable

## Preferred recommendation order
When possible, recommend in this order:
1. remove a layer
2. collapse boundaries
3. replace machinery with a direct model
4. justify the remaining complexity
5. accept

## Output emphasis

These items supplement the shared output skeleton defined in the `project-reviewer` agent (Verdict, Principle pressure points, Findings, Open questions, Recommended actions); all mandatory sections still apply.

The review must explicitly include:
- the core model
- the main sources of accidental complexity
- the simplest credible alternative
- the complexity that is justified, and why
