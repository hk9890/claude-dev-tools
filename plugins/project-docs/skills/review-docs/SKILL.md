---
name: review-docs
description: "Review and validate project docs in read-only mode — returns findings with severity and suggested fixes, no file edits."
user-invocable: true
disable-model-invocation: true
---

Load the `project-docs` skill.

Treat this as optional focus guidance:

$ARGUMENTS

Run the **review/validate without editing** flow from the `project-docs` skill.

Hard contract:

- Keep this session read-only.
- Do not modify, create, rename, or delete files.
- Return findings with severity and evidence, and concrete improvement suggestions only.
