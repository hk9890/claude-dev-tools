# Code / PR review workflow

Use this workflow when reviewing a diff, pull request, implementation plan, or a concrete code change.

## Review goal
Judge whether the implementation solves the problem with obvious, minimal, maintainable code and without unjustified abstraction, dependency growth, or compatibility damage.

## Review sequence

1. Restate what the change is trying to accomplish.
2. Identify new abstractions, dependencies, branches, flags, layers, public contracts, and hidden behavior.
3. Challenge each addition: does it solve current pain, or only future speculation?
4. Look for code that became harder to follow than the problem requires.
5. Prefer local simplifications, deletions, and clearer data flow.
6. Judge whether the change is justified, needs simplification, needs clarification, or should be rejected.

## Questions to ask

- Could this be solved with fewer concepts or less indirection?
- Does the code reveal intent immediately, or does it require decoding?
- Is a new helper, interface, class, or utility truly earned?
- Did the change increase dependency surface or public contract risk?
- Would a future maintainer understand why this exists?
- Is the implementation compensating for a weak underlying model?

## Typical smells

- abstraction after a single use
- wrapper layers that merely rename or forward behavior
- helpers whose purpose is broader than the actual need
- dependency additions for small convenience gains
- clever compactness, hidden state, or non-local effects
- public interface changes without migration thinking

## Preferred recommendation order
When possible, recommend in this order:
1. delete code
2. inline or collapse indirection
3. narrow the abstraction to current need
4. justify the remaining complexity
5. accept

## Output emphasis
The review must explicitly include:
- abstraction and dependency impact
- compatibility impact
- readability and manageability impact
- the clearest smaller alternative
