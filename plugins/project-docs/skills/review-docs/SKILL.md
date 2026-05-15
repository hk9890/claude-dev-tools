---
name: review-docs
description: "Review and validate project docs in read-only mode — reports findings by severity with suggested fixes, no file edits."
user-invocable: true
disable-model-invocation: true
---

Load the `project-docs` skill.

Optional scope argument (advisory only — does not override lifecycle checks):

$ARGUMENTS

Run the **review/validate without editing** flow from the `project-docs` skill.

Hard contract:

- Keep this session read-only.
- Do not modify, create, rename, or delete files.
- Return findings with severity and evidence, and concrete improvement suggestions only.

Primary procedure: `references/project-doc-review-guidelines.md` in the `project-docs` skill.
