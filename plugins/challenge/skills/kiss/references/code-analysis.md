# Code analysis

Use when the target is a diff, pull request, or a concrete code change.

## Goal
Judge whether the implementation solves the problem with obvious, minimal, maintainable code and without unjustified abstraction, dependency growth, or compatibility damage.

## Sequence

1. Restate what the change is trying to accomplish.
2. Identify new abstractions, dependencies, branches, flags, layers, public contracts, and hidden behavior.
3. Challenge each addition: does it solve current pain, or only future speculation?
4. Look for code that became harder to follow than the problem requires.
5. Prefer local simplifications, deletions, and clearer data flow.
6. Judge whether the change is justified, needs simplification, needs clarification, or should be rejected.

## Questions to ask

- Could this be solved with fewer concepts or less indirection?
- Does the code reveal intent immediately, or does it require decoding?
- Is a new helper, interface, class, or utility earned — has it reached the **Rule of Three**?
- Did the change widen the public contract? **Hyrum's Law**: with enough users, every observable behaviour becomes someone's dependency.
- Would a future maintainer understand why this exists?
- Is the implementation compensating for a weak underlying model?

## Typical smells

- abstraction after a single use — **speculative generality**
- wrapper layers that merely rename or forward behavior — **middle man**
- helpers whose purpose is broader than the actual need
- dependency added for a small convenience: *a little copying is better than a little dependency*
- clever compactness, hidden state, or non-local effects — **Kernighan's law**: write it as cleverly as you can, and you are by definition not smart enough to debug it
- public interface changes without migration thinking

## Preferred recommendation order
When possible, recommend in this order:
1. delete code — but clear **Chesterton's Fence** first: know why it is there before removing it
2. inline or collapse indirection
3. narrow the abstraction to current need
4. justify the remaining complexity
5. accept

## Terms
**Rule of Three** — Don Roberts, quoted in Fowler, *Refactoring*: abstract on the third repetition,
not the first. **Speculative generality**, **middle man** — Fowler, *Refactoring* (code smells).
**Hyrum's Law** — Hyrum Wright; *Software Engineering at Google*. **Kernighan's law** — Kernighan &
Plauger, *The Elements of Programming Style*. **Chesterton's Fence** — G. K. Chesterton, *The Thing*.
*A little copying is better than a little dependency* — Rob Pike, Go proverbs.
