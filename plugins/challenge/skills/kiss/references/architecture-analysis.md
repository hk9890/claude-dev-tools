# Architecture analysis

Use when the target is a design, component structure, dependency choice, service boundary, integration plan, or broader architectural proposal.

## Goal
Judge whether the design reduces the real problem to an intellectually manageable shape without introducing unnecessary machinery.

## Sequence

1. Name the core model: entities, relationships, invariants, and main flows.
2. Distinguish essential complexity from **accidental complexity** (Brooks).
3. Identify every new layer, boundary, abstraction, dependency, and operational concern.
4. Test whether each one has earned its place.
5. Ask whether a smaller, flatter, more direct design would work.
6. Judge compatibility risk, operational risk, and comprehension cost.

## Questions to ask

- What is the stable core model of the system?
- Which moving parts are essential, and which are self-inflicted?
- Can one competent engineer still reason about the whole design?
- Does this abstraction absorb complexity or merely relocate it — is it a **shallow module**?
- Is decomposition reducing risk, or buying a **distributed monolith** whose coordination tax **Conway's Law** predicted?
- Is this dependency justified, or is it spending an **innovation token** on fashion?

## Typical smells

- architecture driven by tools rather than domain needs — the **golden hammer**
- speculative layers for future reuse — **speculative generality**
- decomposition with unclear ownership or weak boundaries
- indirection that obscures the main execution path
- designs that **complect**: many concepts must be held before one use case makes sense

## Preferred recommendation order
When possible, recommend in this order:
1. remove a layer
2. collapse boundaries
3. replace machinery with a direct model
4. justify the remaining complexity
5. accept

## Terms
**Accidental complexity** — Fred Brooks, *No Silver Bullet*; developed in Moseley & Marks, *Out of
the Tar Pit*. **Shallow module** — John Ousterhout, *A Philosophy of Software Design*: an interface
nearly as complex as the implementation it hides. **Complect** — Rich Hickey, *Simple Made Easy*: to
interleave what should stand apart. **Innovation token** — Dan McKinley, *Choose Boring Technology*.
**Conway's Law** — Melvin Conway. **Speculative generality** — Fowler, *Refactoring*. **Golden
hammer** — Brown et al., *AntiPatterns*.
