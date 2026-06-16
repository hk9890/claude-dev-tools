# tasks — plugin rules

Design decisions for the `tasks` plugin that are not derivable from the code.

## 1. This is a literacy skill, not a methodology

The plugin's scope is **how to use `taskmgr`**: the data model, the core commands, and the
discipline of keeping the tracker honest. It deliberately does **not** port the `beads-tasks`
design — no planning/execution orchestration, no tasker/reviewer/verifier agents, no
acceptance-review gates, no serialized-writes orchestrator protocol. `taskmgr` is a tracker;
how a session chooses to orchestrate work on top of it is a separate concern and out of scope
for this plugin.

## 2. The CLI is the source of truth for its own surface

`taskmgr commands [--json]` emits a machine-readable catalog of every command, flag, and
example, derived from the live command tree. The skill teaches the model and the verbs but
points at that catalog for exact flags rather than restating the full command reference — so
the skill stays small and cannot drift from the tool.

## 3. taskmgr is a CLI dependency — runtime check, not `plugin.json`

The skill requires the `taskmgr` binary and a `.tasks/` store. The harness cannot install CLI
binaries, so this is enforced with a use-time runtime check that stops with guidance if either
is missing — the same pattern `project-explore` uses for its CLI prerequisite. Do **not** add a
`dependencies` entry for `taskmgr` in `plugin.json`; that field declares plugin-on-plugin
dependencies only.

## 4. Anchored on the binary name `taskmgr`

The upstream project is checked out as `agent-tasks-control`, titled `task-manager`, and its Go
module is `github.com/hk9890/task-manager` — but the installed binary is `taskmgr`. The skill
references `taskmgr` throughout, since that is the stable name an agent actually invokes.
