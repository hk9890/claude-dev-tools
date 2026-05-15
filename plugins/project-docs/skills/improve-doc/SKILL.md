---
name: improve-doc
description: "Improve docs structure and quality — split, merge, slim, or consolidate; may propose and apply edits (not read-only)."
user-invocable: true
disable-model-invocation: true
---

Load the `project-docs` skill.

Treat this as optional focus guidance:

$ARGUMENTS

Run the improve-doc workflow from the `project-docs` skill:

- If strong incident context is present, run the incident-driven targeted path.
- Otherwise, run discussion-first analysis (positives, negatives, proposals), ask what to improve before edits, and require explicit confirmation before aggressive removals, consolidation, or deletion.
- This skill is not read-only by default; it can propose and then apply docs changes based on user direction.
