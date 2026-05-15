# AGENTS.md Template

Use this structure when creating or refreshing `AGENTS.md`. Keep it concise and pointer-based — it is a routing surface, not a handbook.

## Structure

```markdown
# AGENTS.md — <project-name> routing

## Repository purpose

<One or two sentences: what this repo does and its primary tech stack.>

## Use-case routing

### <Use case — e.g. "Research, planning, analysis">

Load [docs/<RELEVANT-DOC>.md](docs/<RELEVANT-DOC>.md) to <one-line reason>.

### <Use case — e.g. "Making code changes">

Load [docs/CODING.md](docs/CODING.md) before making code or file changes; follow the constraints there.

### <Use case — e.g. "Testing and verification">

Load [docs/TESTING.md](docs/TESTING.md) to understand how to run tests and verify your work.

### <Use case — e.g. "Commit, branch, PR workflow">

Load [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) before git operations or opening a PR.
```

## Rules

- One `###` section per use case. Each section names the doc or skill to load and the one-line reason.
- Only include sections that have real backing docs or installed skills. Skip hollow entries.
- Keep the project summary (2–3 sentences max). It is not a README.
- Do not duplicate procedure content here — that belongs in the docs files.
- Route to installed skills by name when no local doc exists for a topic (e.g. `Use the github-releases skill for release workflow`).

## Worked example

See [../examples/AGENTS.md](../examples/AGENTS.md) for a complete, realistic example.
