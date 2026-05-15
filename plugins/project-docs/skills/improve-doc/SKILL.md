---
name: improve-doc
description: "Improve docs structure — split, merge, slim, or consolidate; confirms with you before aggressive removals or deletion (not read-only)."
user-invocable: true
disable-model-invocation: true
---

Load the `project-docs` skill.

Optional scope argument (advisory only — does not override lifecycle checks):

$ARGUMENTS

Run the improve-doc workflow from the `project-docs` skill:

- If the user supplies a specific doc file and a concrete problem to fix, run the targeted single-doc path directly.
- Otherwise, run discussion-first analysis (positives, negatives, proposals), ask what to improve before edits, and require explicit confirmation before aggressive removals, consolidation, or deletion.
- This skill is not read-only by default; it can propose and then apply docs changes based on user direction.

Primary procedure: `references/docs-improve.md` in the `project-docs` skill.
