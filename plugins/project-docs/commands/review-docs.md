---
description: Review and validate project docs in read-only mode (no file edits)
---

Load the `coder-docs` skill.

Treat this as optional context/focus guidance:

$ARGUMENTS

Run the **review/validate without editing** flow from the `coder-docs` skill.

Hard contract:

- Keep this session read-only.
- Do **not** modify, create, rename, or delete files.
- Return findings with severity/evidence and concrete improvement suggestions only.
