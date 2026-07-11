---
name: project-exec-releasing
description: "Cut a release the way the project itself defines it."
user-invocable: true
disable-model-invocation: true
argument-hint: "[version-or-scope]"
---

**Cut a release.** Scope: $ARGUMENTS

Follow the project's own release flow exactly. Do not invent versioning, gates, or steps — if the project defines no release flow, do nothing and report that releasing is not configured for this project.

If the project offers more than one release path and the scope above does not settle which, ask the user — do not assume.

Report the outcome faithfully.
