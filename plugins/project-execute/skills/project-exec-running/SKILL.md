---
name: project-exec-running
description: "Run and drive the project the way the project itself defines it."
user-invocable: true
disable-model-invocation: true
argument-hint: "[what-to-run-or-verify]"
---

**Run the project.** Scope: $ARGUMENTS

Follow the project's own run flow exactly. Do not invent launch commands, entrypoints, or ports — if the project defines no run flow, do nothing and report that running is not configured for this project. A flow counts as defined only if stated in the project's docs (CLAUDE.md/AGENTS.md routing, README) or config (task-runner scripts, container or compose files, service definitions); check those before reporting not configured.

A project states only its local delta and routes the rest to a general run skill. Follow that route where it exists, and let the local instructions win wherever the two conflict.

With no scope, start the project, confirm it came up, and ask what to drive.

If the project offers more than one way to run and the scope above does not settle which, ask the user — do not assume.

Report faithfully: what was started and how, what was driven, what was observed, anything skipped, and anything left running.
