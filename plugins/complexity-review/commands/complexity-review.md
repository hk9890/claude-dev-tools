---
description: Skeptical complexity review of requirements, architecture, or code — challenges every abstraction and dependency
argument-hint: "<requirements / architecture description / code or PR>"
---

Load the `complexity-review` skill.

Treat this as optional context/focus guidance:

$ARGUMENTS

Run the appropriate review workflow from the `complexity-review` skill:

- If the user provides requirements or a scope description → run requirements review
- If the user provides a design, architecture proposal, or system description → run architecture review
- If the user provides code, a PR, or a diff → run code/PR review
- If unclear, ask the user what they want reviewed before proceeding

Default stance: bias toward simplicity, reduce scope, challenge every new abstraction and dependency.
