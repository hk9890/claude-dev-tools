---
name: project-review-complexity
description: "Skeptical review for accidental complexity and unjustified abstractions in requirements, designs, PRs, or code."
when_to_use: "Use when the user wants a complexity or simplicity review of requirements, a design, a PR, or code. Triggers on 'review this for complexity', 'is this over-engineered?', 'does this earn its complexity?'. Not for implementation work or style-only linting, and not for structure, consistency, docs, or test reviews — each has its own skill. Invoke with an optional argument scoping what to review; with no argument it reviews the whole project. The review runs in an isolated context and cannot see this conversation — pass everything it needs (paths or the artifact text itself) in the argument."
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

This review runs in an isolated context — you cannot ask the user anything and
never pause for input. Everything to review must be in the invocation above: an
artifact "from the conversation" is visible only if its text was passed inline.
Your only deliverable is the structured report — never an edit, an action on the
user's behalf, or a question awaiting a reply.

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

## Output

Follow the shared output skeleton defined in the `project-reviewer` agent.
The skill-specific pieces below slot into that skeleton:

- **Verdict labels**: one of `approve`, `approve with concerns`,
  `needs clarification`, `reject`. Prefer `needs clarification` over a forced
  verdict when required context is genuinely absent.
- **Skill-specific opening section** — `## Principle pressure points`: list
  the governing principles from `references/principles.md` most affected by
  the artifact.
- **Skill-specific middle section** — `## Open questions`: list missing
  context that blocks confident judgment. When this section is non-empty, the
  verdict should usually be `needs clarification`.
- **Per-finding `Recommended action`** — frame it as the simpler alternative
  or the explicit justification the artifact owes.

## Mode-specific emphasis

- **Requirements review** — explicitly state the minimal acceptable scope, the non-goals that should stay out, and the top sources of accidental complexity in the requirement set.
- **Architecture review** — explicitly name the core model, the main sources of accidental complexity, the simplest credible alternative, and the complexity that is justified and why.
- **Code / PR review** — explicitly call out abstraction, dependency, compatibility, and readability impact.
