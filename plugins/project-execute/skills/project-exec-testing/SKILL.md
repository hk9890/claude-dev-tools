---
name: project-exec-testing
description: "Run the project's tests the way the project itself defines them."
user-invocable: true
disable-model-invocation: true
argument-hint: "[what-to-test]"
---

**Run the tests.** Scope: $ARGUMENTS

Follow the project's own testing flow exactly. Do not invent commands, frameworks, or steps — if the project defines no testing flow, do nothing and report that testing is not configured for this project. A flow counts as defined only if stated in the project's docs (CLAUDE.md/AGENTS.md routing, README) or config (task-runner scripts, CI); check those before reporting not configured.

If the project offers more than one way to test and the scope above does not settle which to run, ask the user — do not assume.

Report faithfully: what ran, pass/fail, and anything skipped.
