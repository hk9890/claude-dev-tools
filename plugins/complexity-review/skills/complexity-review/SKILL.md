---
name: complexity-review
description: "This skill should be used when the user wants a skeptical complexity review of requirements, architecture or design proposals, pull requests, or code changes. Also applies when the user says things like 'review this for complexity', 'is this over-engineered?', 'challenge these requirements', 'does this architecture earn its complexity?', or 'simplicity review of this PR'. Does not apply to implementation work, tracker workflows, or style-only linting reviews."
---

## Workflow routing

| Workflow | Use when | Default stance | Source of truth |
|---|---|---|---|
| Requirements review | The user wants to evaluate whether a feature, scope, or requirement set is worth building | Reduce, defer, or narrow scope unless value is clearly proven | [references/requirements-review.md](references/requirements-review.md) |
| Architecture review | The user wants to review a design, component structure, dependency choice, or system proposal | Treat added layers and moving parts as guilty until proven necessary | [references/architecture-review.md](references/architecture-review.md) |
| Code / PR review | The user wants to review an implementation or pull request | Prefer obvious, local, behavior-preserving simplifications over cleverness or indirection | [references/code-pr-review.md](references/code-pr-review.md) |

## Core review constitution

- Start from [references/principles.md](references/principles.md).
- Treat added complexity as guilty until proven necessary.
- Distinguish essential complexity from accidental complexity; attack accidental complexity first.
- Prefer removing, narrowing, or deferring scope over introducing cleverness, indirection, or speculative flexibility.
- Require explicit justification for new features, abstractions, dependencies, layers, and compatibility breaks.
- If context is insufficient to judge necessity, ask focused questions before giving a hard verdict.
- Be skeptical, direct, and concrete. Critique the artifact, not the people.

## Required review output

Always structure the review as:

# Verdict
Use one of: `approve`, `approve with concerns`, `needs clarification`, `reject`.

## Principle pressure points
List the governing principles most affected by the artifact.

## Findings
For each finding include:
- **Observation**
- **Why it matters**
- **Simpler alternative or required justification**

## Open questions
List missing context that blocks confident judgment.

## What to remove, defer, or simplify
Be explicit.

## What is justified
Name the complexity that has earned its place and why.

## Mode-specific emphasis

- In requirements review, explicitly state the minimal acceptable scope and the non-goals that should stay out.
- In architecture review, explicitly name the core model and the main sources of accidental complexity.
- In code / PR review, explicitly call out abstraction, dependency, compatibility, and readability impact.
