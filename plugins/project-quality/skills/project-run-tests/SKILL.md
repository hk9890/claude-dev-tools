---
name: project-run-tests
description: "Run the project's test suite using its own testing docs and skills, then report results."
user-invocable: true
disable-model-invocation: true
---

This is a thin entry point. The actual test procedure is **not** defined here — it lives in this project's own docs. Do not assume frameworks, commands, or test layers.

Treat as the source of truth, in order: any installed testing skill that applies, the project's canonical `docs/TESTING.md`, and the "Testing a plugin" routing in `AGENTS.md`. Follow whatever they define.

If no testing skill applies **and** there is no real testing guidance in `docs/TESTING.md`, stop. Tell the user to add `docs/TESTING.md` first, and do not guess commands or invent a test process.

Do not fix failures unless the user asks — this skill runs the tests and reports.

Report faithfully: which test types ran, pass/fail counts, failing output, and anything skipped.
