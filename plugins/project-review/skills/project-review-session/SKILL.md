---
name: project-review-session
description: "Conduct a retrospective on a coding session: candidates for improving the coding agent's environment, in order of severity; applies nothing."
user-invocable: true
disable-model-invocation: true
argument-hint: "[session]"
---

The user has asked for a **retrospective**. You are suggesting improvements to the coding agent's **environment** to improve future runs.

## Steps

1. Read the primary sources for the session to review. `$ARGUMENTS` names it; where that is empty, it is the current session. This may mean searching through session logs on this machine. The **repo** under review is the checkout that session ran in, which can be another directory than the current one: read its files there. Done when you have read the session to its last record, its subagents' records included, or have named the part you did not read.

2. Look for candidates for improvement in these categories. Done when every category carries a candidate or is cleared, and every candidate quotes the session moment that shows it.

- **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** make it easier? _Use when_ the session took a long time to find a piece of information.
- **Automated checks**: are there automated checks that could catch errors the agent made? Linting, typing, tests, filesystem linters? Read the repo's own check command first (its `package.json`/build-tool `lint`/`check` scripts, its CI workflow), so a check that already exists but sits unwired or silently broken is the finding, not a reinvention. A repo with no **guardrail** (no pre-commit hook and no CI job running its lint/typecheck/test command) is itself a finding: an un-linted repo is a standing missed opportunity, not a neutral default. _Use when_ the agent made a mistake an automated check could have caught, or the repo has no guardrail at all.
- **Coding standards**: should the **reviewer agent** be given a new rule to enforce? Should an existing rule be removed or clarified? Classify the violation first: a **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check, full stop: a custom rule in the repo's own linter, a new pre-commit hook, or a new CI job, whichever the repo's language and existing guardrail make cheapest. Default to building the check over writing the rule. Reserve the repo's coding-standards document for genuine **judgement calls** (cross-file consistency, "matches the surrounding style," anything no guardrail could ever substitute for). _Use when_ the reviewer agent failed to catch a mistake.
- **Global AGENTS.md**: are there any steering instructions that should be moved to coding standards (or automated checks) instead? _Use when_ the AGENTS.md file is particularly large - in the repo OR the user's global scope.
- **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is there any custom tooling (CLI's, MCP's) that is particularly token-inefficient? _Use when_ the agent made an expensive tool call.
- **No-ops**: look for instructions in steering files that don't modify the agent's behavior. _Use when_ the steering files are large and unwieldy.
- **Information access**: look for opportunities to increase the agent's access to information. Teeing dev server logs, readonly access to third-party services. _Use when_ a crucial piece of information was not available to the agent.

3. Present these candidates to the user, in order of severity, then the cleared categories. Stop there: the user picks which candidate to apply.

## Reference

### Implementation vs Review

All work goes through two stages: implementation and review. The implementation agent has the most **context pressure**. They are responsible for exploration, writing code, and debugging failures.

The review agent has the least context pressure - it receives a diff, so no exploration needed. It often does not need to write code or debug.

This means that the review agent should be responsible for imposing coding standards, not the implementation agent.

### Files

A candidate names the file it changes:

- `CLAUDE.md`/`AGENTS.md`: these files are pushed to the context window of any agent working in the repo. They are for **navigation pointers** to other files, and little else.
- The repo's coding-standards document, the one its `AGENTS.md` routes to for coding rules: this file is read during review, not implementation.
- Docs: reference files, pointed to by other files. Look for an existing doc before proposing a new one.
- Skills: for user-invoked commands, or for docs whose description must sit in the agent's context window.

Which of these files carries what is owned by `instruction-writing:writing-project-docs` for project docs and by `instruction-writing:writing-skills` for skills. Where a candidate depends on that, call the Skill tool with the one it needs.
