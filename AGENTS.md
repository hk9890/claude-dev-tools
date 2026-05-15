# AGENTS.md — claude-dev-tools routing

## Repository purpose

Plugin marketplace for Claude Code. Each subdirectory under `plugins/` is a self-contained plugin.

## Use-case routing

### Research, planning, understanding the repo

Load [docs/OVERVIEW.md](docs/OVERVIEW.md) to understand the architecture and how plugins are structured.

### Making changes, commits, PRs

Load [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) before making commits or opening a PR.

### Developing or contributing a new plugin

Load [docs/CODING.md](docs/CODING.md) for step-by-step plugin creation, rules files, and scaffolding guidance. 
Load [docs/OVERVIEW.md](docs/OVERVIEW.md) for directory layout and architecture reference.

### Testing a plugin

Load [docs/TESTING.md](docs/TESTING.md) for how to run plugins locally, run structural validation, and smoke-test skills and commands.

### Releasing plugins

Load [docs/RELEASING.md](docs/RELEASING.md) for the version bump, quality gates, and release process.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
