# project-explore — Design Decisions

Non-derivable design decisions and constraints for this plugin. Read before making changes.

## 1. Research is inline — no sub-agent

The original design (v2, `private/research-explore.html`) included a separate `project-researcher` sub-agent. After plan-review (2026-05-21), research was folded inline into the `project-explore` orchestrator skill. There is no agent file in `agents/` and no agent component in this plugin. The `agents/` directory does not exist.

**Do not add a sub-agent without reopening the design decision.** The motivation for removing it was keeping context clean without the added complexity of agent dispatch for a task that does not need isolation.

## 2. Understanding file is a throwaway temp file

The project-understanding file written during Phase 1 is created with `mktemp` and is ephemeral. It is not committed, not attached to a task, and not preserved after the session.

**Do not commit the understanding file or add a scratch directory to hold it.** The file exists only to pass research output to Phase 2 within the same session.

## 3. taskmgr issue types and labels

Findings (broken or rough behaviour) are filed as taskmgr type `bug` with label `explore:finding`. Questions (genuine ambiguity that cannot be resolved from docs and source) are filed as taskmgr type `task` with label `explore:question`. Both are children of the exploration epic.

`taskmgr` has no native `question` type (its types are `task`, `bug`, `feature`, `epic`, `chore`). No custom taskmgr types are used.

**Do not change the type/label mapping without updating `SKILL.md`, this file, and the epic description.**

## 4. taskmgr is a Phase-0 runtime check only — no `dependencies` field

The skill checks at runtime that `.tasks/` exists and `taskmgr` is usable. If taskmgr is absent, the skill stops with guidance. This is the same "stop if not configured" pattern used by `project-exec-testing` in `project-quality`, and the same runtime-check pattern the `tasks` plugin uses for its own `taskmgr` prerequisite.

There is no `dependencies` field in `plugin.json` for taskmgr. The `plugin.json` `dependencies` field declares a dependency on another Claude Code marketplace plugin — it is honored by the harness (see [docs/CODING.md](../../docs/CODING.md) and https://code.claude.com/docs/en/plugin-dependencies). taskmgr is a CLI tool, not a marketplace plugin. A `plugin.json` dependency entry cannot cause the harness to install a CLI binary. The runtime check is the canonical pattern for declaring a hard dependency on a CLI tool.

**Do not add a `dependencies` entry for `taskmgr` or any CLI tool in `plugin.json` — that field declares plugin-on-plugin dependencies only; use a runtime check for CLI prerequisites.**

## 5. Mutation safety

The skill asks at session start (Phase 0) whether a scratch or dev environment is available and prefers it for any action that mutates state. Any write, delete, or send action requires explicit per-action confirmation before running. Volume actions (creating hundreds of entries) always count as destructive and always require confirmation.

**Do not make the mutation check optional or skip it for "obviously safe" actions.**

## 6. Dedup before filing

Before filing a finding or question, the skill lists open children of the exploration epic and does a title/text check. If a likely duplicate exists, the skill comments on the existing task rather than creating a new one.

**Keep dedup lightweight — title/text comparison only. Do not add vector similarity or external dedup tooling.**

## 7. Check-in cadence and escape-hatch boundary

Phase 2 step 5 must call `AskUserQuestion` after every iteration — silence is never consent. The user may suspend this with "do next N without asking" / "keep going, don't ask" / "explore freely until I stop you", but only for non-destructive actions; destructive actions (rule 5) always force stop-and-confirm. Session 2026-05-23 ran 11 iterations but only stopped properly twice because the agent inferred continue from silence — mandating the tool, not the behaviour, is what prevents that shortcut.

**Do not infer continue from silence, and do not extend the escape hatch to cover destructive actions.**

## 8. Launch patterns are described inline — no dependency on the `run` skill

The `run` skill is a harness built-in, not a depend-able plugin. The `project-explore` skill describes launch patterns for each project type (CLI, server, TUI, library, script) inline in Phase 2 of `SKILL.md`. The skill must be self-contained.

**Do not add a `run` skill dependency or reference it as a prerequisite.**
