---
name: project-exec-coding
description: "Implement a change strictly following the project's own coding conventions."
user-invocable: true
disable-model-invocation: true
argument-hint: "[what-to-implement]"
---

**Implement the change.** Scope: $ARGUMENTS

Follow the project's own coding conventions and constraints exactly. Do not invent patterns or rules the project does not state — if the project documents no coding guidance, there are no project-specific rules to apply: implement normally and note that no coding conventions are configured for this project.

If the project's conventions leave the approach genuinely ambiguous and the scope above does not settle it, ask the user — do not assume.

Report what you changed.
