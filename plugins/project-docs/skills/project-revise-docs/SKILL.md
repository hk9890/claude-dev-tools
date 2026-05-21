---
name: project-revise-docs
description: "Use this at the end of a session to capture learnings about working with this repo into the canonical docs and AGENTS routing — never writes to CLAUDE.md or .claude.local.md."
user-invocable: true
disable-model-invocation: true
---

Load the `project-docs` skill.

Optional scope argument (advisory only — does not override lifecycle checks):

$ARGUMENTS

Run the **project-revise-docs** flow from the `project-docs` skill:

- Reflect on what would have helped Claude work more effectively in this session.
- Route each learning into the correct canonical doc or AGENTS routing entry.
- Skip personal preferences — those belong in `.claude.local.md`, edited by the user directly.
- Get per-addition approval before writing.
- May create a missing canonical doc on the fly when a substantive learning warrants it.
