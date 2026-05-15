---
name: init-or-update-docs
description: "Refresh or update existing project docs lifecycle guidance; falls back to creation only when docs are missing."
user-invocable: true
disable-model-invocation: true
---

Load the `project-docs` skill.

Treat this as optional focus guidance:

$ARGUMENTS

Run the **update-focused** docs lifecycle workflow from `project-docs`:

- Prefer this when docs already exist and need refresh or correction.
- Keep scope docs-only; do not edit source code files.
- If canonical docs are missing, fall back to baseline creation.
- If the user explicitly asks for greenfield docs setup, steer to `/create-docs`.
