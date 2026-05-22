---
name: complexity-review
description: "Skeptical complexity review of requirements, architecture, design proposals, PRs, or code changes — flags accidental complexity and unjustified abstractions."
when_to_use: "Use when the user wants a complexity or simplicity review of requirements, architecture, design proposals, PRs, or code changes. Triggers on 'review this for complexity', 'is this over-engineered?', 'challenge these requirements', 'does this architecture earn its complexity?', 'simplicity review of this PR'. Does not apply to implementation work, tracker workflows, or style-only linting reviews. Invoke with a single argument naming what to review (a path, a PR or diff reference, or the proposal text itself); the review runs in an isolated context and cannot see this conversation, so include inline anything that exists only here. With no argument it reviews the whole project."
argument-hint: "[what-to-review]"
context: fork
agent: project-reviewer
---

## Invocation

What to review: $ARGUMENTS

This is a free-form description of what to review — for example "architecture
review of component X", "challenge the requirements for the export feature", a
path, a PR or diff reference, or the artifact itself pasted inline (a design
description or proposal lifted from the conversation).

From it, determine which workflow(s) apply — see the routing table below, and
pick all that fit — and locate the target: read it if it is a reference, take it
at face value if it is inline text. For a code review of uncommitted work, the
target is the working-tree diff (`git diff`).

**If no argument is given, review the whole project.**

## Workflow routing

| Workflow | Applies when the target is | Default stance | Source of truth |
|---|---|---|---|
| Requirements review | a feature, scope, or requirement set — is it worth building? | Remove, defer, or narrow scope unless value is clearly proven | [references/requirements-review.md](references/requirements-review.md) |
| Architecture review | a design, component structure, dependency choice, or system proposal | Treat added layers and moving parts as guilty until proven necessary | [references/architecture-review.md](references/architecture-review.md) |
| Code / PR review | an implementation, pull request, or diff | Prefer obvious, local, behavior-preserving simplifications over cleverness or indirection | [references/code-pr-review.md](references/code-pr-review.md) |

## Complexity stance

- Start from [references/principles.md](references/principles.md) — it is the constitutional source for every verdict.
- Treat added complexity as guilty until proven necessary.
- Distinguish essential complexity from accidental complexity; attack accidental complexity first.
- Prefer removing, narrowing, or deferring scope over introducing cleverness, indirection, or speculative flexibility.
- Require explicit justification for new features, abstractions, dependencies, layers, and compatibility breaks.

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
List missing context that blocks confident judgment. When context is insufficient
to judge necessity, raise it here and use the `needs clarification` verdict rather
than forcing a hard verdict.

## What to remove, defer, or simplify
Be explicit.

## What is justified
Name the complexity that has earned its place and why.

## Mode-specific emphasis

- **Requirements review** — explicitly state the minimal acceptable scope, the non-goals that should stay out, and the top sources of accidental complexity in the requirement set.
- **Architecture review** — explicitly name the core model, the main sources of accidental complexity, the simplest credible alternative, and the complexity that is justified and why.
- **Code / PR review** — explicitly call out abstraction, dependency, compatibility, and readability impact.
