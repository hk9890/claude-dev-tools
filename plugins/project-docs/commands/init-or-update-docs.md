---
description: Refresh or update existing project docs lifecycle guidance (create fallback only when missing)
---

Load the `coder-docs` skill.

Treat this as optional context/focus guidance:

$ARGUMENTS

Run the **update-focused** docs lifecycle workflow from `coder-docs`:

- Prefer this command when docs already exist and need refresh/correction.
- Keep scope docs-only; do not edit source code files.
- If canonical docs are missing, fall back to baseline creation.
- If the user explicitly asks for greenfield docs setup, steer to `/create-docs`.
