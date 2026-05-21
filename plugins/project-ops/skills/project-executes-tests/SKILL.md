---
name: project-executes-tests
description: "Run the project's test suite — discovers and loads any installed testing skills, follows docs/TESTING.md, then executes the tests and reports results."
user-invocable: true
disable-model-invocation: true
---

Run the project's tests. Do not assume anything about how this project tests — derive everything from the two sources below.

## 1. Gather guidance

- Look for installed testing skills and load any that apply. Treat them as the source of truth for how tests are run here.
- Read `docs/TESTING.md` and any TESTING routing in `AGENTS.md` for the repo-specific test-layer policy, commands, and minimum checks.

## 2. If there is no guidance

If **no** testing skill applies **and** `docs/TESTING.md` does not exist (or has no real test guidance), do not guess commands or invent a test process.

Instead, stop and tell the user that there is no testing guidance for this project, and that they should create `docs/TESTING.md` describing how tests are run (the `project-docs` plugin can scaffold it). Ask whether they want to proceed anyway with whatever you can infer, but do not run anything until they confirm.

## 3. Run the tests

Optional scope argument (advisory only):

$ARGUMENTS

- Run the tests exactly as the skills and `docs/TESTING.md` define them — no assumed test types, frameworks, or commands.
- If several kinds of tests are defined (for example unit, integration, e2e, lint, type-check) and it is not clear which the user wants run, ask the user which to execute before running.
- If a scope argument is given, use it to resolve that ambiguity; still report any test types you did not run and why.
- Do not fix failures as part of this run unless the user asks — this skill executes and reports.

## 4. Report

Report faithfully: which test types ran, pass/fail counts, failing tests with their output, and anything skipped. If tests fail, say so plainly with the evidence.
