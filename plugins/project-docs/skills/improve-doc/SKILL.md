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

- If the user provides a concrete docs failure or incident context, run incident-driven mode (capture incident, propose recurrence-prevention edits, confirm high-impact changes, then implement and verify).
- Otherwise, run discussion-first mode (summarize strengths, gaps, and options; ask which options to apply; then implement with verification).
- This skill is not read-only by default; it can propose and then apply docs changes based on user direction.

Primary procedure: `references/docs-improve.md` in the `project-docs` skill.
