---
name: kiss
description: "Keep it stupid simple — challenge accidental complexity in whatever is in front of you."
when_to_use: "Use when the user wants something challenged for over-engineering or simplified — a snippet, a design sketch, a requirement, the working diff. Triggers on 'simplify this', 'is this over-engineered?', 'does this earn its complexity?', 'kiss this'. Operates on what is in the current conversation, in context; it is not a scoped whole-repository audit."
argument-hint: "[what-to-challenge]"
---

# KISS — challenge the complexity

Treat every added layer, abstraction, and moving part as guilty until proven necessary.
Work on what is in front of you right now, in this conversation. Unlike the
`project-review` skills, this runs in context: you can see the conversation, you may ask
the user a question, and you may apply the simplification once it is agreed.

> **TODO — body is a skeleton.** The procedure below still needs to be written for
> on-demand, in-context use. It was moved here from `project-review-complexity`, which was
> a scoped, forked, read-only audit that emitted a structured report. That framing is gone:
> no cost rungs, no isolated context, no verdict labels. The prior procedure is recoverable
> from git history at `plugins/project-review/skills/project-review-complexity/SKILL.md`.
> The `references/` files below carry over unchanged and are still the substance.

## Invocation

`$ARGUMENTS` is what to simplify — a free-form description, a path, a diff reference, or an
artifact pasted inline. **If nothing is given, simplify what the conversation is currently
about.**

TODO: define how the target is resolved when `$ARGUMENTS` is empty.

## Workflow routing

Determine which workflow applies and pick all that fit.

| Workflow | Applies when the target is | Default stance | Source of truth |
|---|---|---|---|
| Requirements | a feature, scope, or requirement set — is it worth building? | Remove, defer, or narrow scope unless value is clearly proven | [references/requirements-review.md](references/requirements-review.md) |
| Architecture | a design, component structure, dependency choice, or system proposal | Treat added layers and moving parts as guilty until proven necessary | [references/architecture-review.md](references/architecture-review.md) |
| Code | an implementation, pull request, or diff | Prefer obvious, local, behavior-preserving simplifications over cleverness or indirection | [references/code-pr-review.md](references/code-pr-review.md) |

TODO: the three reference workflows still describe a *review* that produces findings.
Rework them to describe a *simplification* that produces a concrete proposed change.

## Complexity stance

TODO: carry over from [references/principles.md](references/principles.md), restated for
in-context use.

## Output

TODO: define. Not a structured report — this is a conversation. Likely: name the complexity,
state what it buys and what it costs, propose the simpler form, and offer to apply it.
