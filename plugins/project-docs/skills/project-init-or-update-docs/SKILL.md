---
name: project-init-or-update-docs
description: "Use this when docs exist but are stale or incomplete — refreshes existing docs; falls back to creation only when docs are missing."
user-invocable: true
disable-model-invocation: true
---

Load the `project-docs` skill.

Optional scope argument (advisory only — does not override lifecycle checks):

$ARGUMENTS

Run the **update-focused** docs lifecycle workflow from `project-docs`:

- Prefer this when docs already exist and need refresh or correction.
- Keep scope docs-only; do not edit source code files.
- If canonical docs are missing, fall back to baseline creation.
- If the user explicitly asks for greenfield docs setup, steer to the `project-create-docs` skill.
