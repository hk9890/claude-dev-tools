# AGENTS.md — claude-dev-tools routing

## Repository purpose

Plugin marketplace for Claude Code. Each subdirectory under `plugins/` is a self-contained plugin.

## Plugin locations

| Plugin | README | Purpose |
|---|---|---|
| `plugins/beads-tasks` | [README](plugins/beads-tasks/README.md) | Beads task tracking agents |
| `plugins/complexity-review` | [README](plugins/complexity-review/README.md) | Complexity review commands and skill |
| `plugins/github-releases` | [README](plugins/github-releases/README.md) | GitHub release workflow |
| `plugins/project-docs` | [README](plugins/project-docs/README.md) | Project docs lifecycle commands and skill |

## Repo docs

- Architecture and plugin layout: [docs/OVERVIEW.md](docs/OVERVIEW.md)
- Commit and change workflow: [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md)

## Plugin structure contract

Every plugin must have:

- `.claude-plugin/plugin.json` — manifest (name, description, version, author)
- `README.md` — purpose, commands table, plugin structure diagram

Optional:
- `commands/` — slash command definitions (`*.md` with frontmatter)
- `skills/` — skill definitions (`SKILL.md` + `references/`)
- `agents/` — subagent definitions (`*.md`)

## Change workflow

Task tracking uses the beads (`bd`) CLI. See [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md).
