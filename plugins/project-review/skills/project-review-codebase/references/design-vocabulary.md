<!-- Source: adapted from mattpocock/skills codebase-design (MIT) — see ../../../NOTICE.md; terms trace to Ousterhout and Feathers. -->
# Design vocabulary for the architecture dimension

Use these terms precisely in findings — substituting near-synonyms ("component",
"service", "API", "boundary") blurs what the finding claims.

## Glossary

- **Module** — any unit with an interface and an implementation. Deliberately
  scale-neutral: a function, class, file, package, or cross-tier component all
  qualify.
- **Interface** — everything a caller must know to use the module correctly:
  signatures, invariants, sequencing rules, failure modes, setup requirements,
  performance expectations. Wider than a type declaration.
- **Implementation** — the code behind the interface.
- **Depth** — leverage of the interface: how much behaviour is accessible per
  unit of interface complexity. A **deep** module hides substantial behaviour
  behind a minimal surface; a **shallow** module's interface mirrors its
  implementation's scale.
- **Seam** — the place where behaviour can be changed without editing the code
  at that place; the physical location of a module's interface. Where a seam
  goes is a distinct design question from what sits behind it.
- **Adapter** — a concrete realizer of an interface at a seam. Names the role
  (which slot it fills), not the contents.
- **Leverage** — the caller-side benefit of depth: one implementation serving
  many call sites and test scenarios.
- **Locality** — the maintainer-side benefit of depth: changes, bugs, and
  understanding stay concentrated in one place instead of diffusing across
  callers.

## Principles the findings lean on

- **The deletion test.** Imagine the module removed. If its complexity scatters
  across N callers, it was earning its place. If the complexity simply
  vanishes, the module was forwarding data — flag it.
- **One adapter signals hypothetical variation; two signal actual variation.**
  An interface with exactly one implementation is speculative until a real
  second implementation exists. A test double counts as a second adapter only
  when it genuinely substitutes at that seam.
- **Depth characterizes the interface, not the contents.** A deep module may be
  built from small replaceable pieces internally — that is fine as long as they
  stay hidden behind the public interface.
- **The interface is the test boundary.** Callers and tests should cross the
  same seam. Tests that must import a module's internals are evidence of a
  missing or misplaced seam, not of thorough testing.

## Testability signals

Read these as symptoms when judging a module:

- Dependencies **received** (parameters, constructor) rather than instantiated
  internally — internal `new`/import of a concrete collaborator pins the module
  to it and forces tests past the interface.
- Results **returned** rather than applied as side effects — a function that
  mutates shared state can only be verified by inspecting that state.
- **Small surface** — fewer methods and simpler parameters mean fewer tests and
  simpler setup; a wide surface on thin behaviour is shallowness made visible.
