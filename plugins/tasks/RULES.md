# tasks — plugin rules

Design decisions for the `tasks` plugin that are not derivable from the code.

## 1. Scope: literacy plus a thin creation/execution layer

The plugin's core is **how to use `taskmgr`**: the data model, the core commands, and the discipline
of keeping the tracker honest (the `tasks` skill). On top of that literacy it adds two thin,
generic layers:

- **Creation** — the `tasks-create` skill turns findings already present in the conversation (from a
  review, a `/simplify`, an exploration, etc.) into well-formed `bug`/`chore`/`task` issues using one
  standard body template.
- **Execution workers** — the generic `implementer` and `verifier` agents execute a single assigned
  task and verify a single outcome. They are dumb workers handed one unit of work; they carry no
  planning or orchestration logic.

It deliberately still does **not** port the `beads-tasks` methodology wholesale: no planning/work
intake documents, no serialized-writes orchestrator protocol, no acceptance-review *task* pattern.
Orchestration of these workers (the ready→implement→verify→record loop) lives in a separate
execution skill/workflow, not here. `taskmgr` is a tracker; how a session sequences work on top of it
is kept thin and explicit rather than encoded as a heavy methodology.

## 2. taskmgr enforces no closure ordering — callers gate themselves

Unlike beads (whose `close` rejects an issue with open blockers), `taskmgr close` never refuses: it
will close an epic with open children and a blocker with an open dependent. Any "don't close until X"
gate is therefore the **caller's** responsibility, checked explicitly with
`taskmgr list -q 'parent == "<id>" && status != "closed"'` (empty ⇒ all children closed). This fact is
documented in the `tasks` skill (section 7) because every agent that closes work must know it. We do
**not** auto-close epics — verification posts a "children verified" comment and a human closes the epic.

## 3. The writer/reader split

taskmgr serializes writes via `.tasks/.lock`, so direct concurrent writes from multiple agents are
safe — which removes beads' reason for a single-writer orchestrator. Roles split by whether they
touch the tracker:

- **implementer** writes directly — it claims its task (`in_progress`) and files a `bug` for any
  defect it discovers, but does **not** close (closure is gated on verification).
- **verifier** writes directly — it closes a *passing single task* and files a `bug` for any failure;
  it never closes an epic (it posts a "ready to close" verdict comment and a human closes it).
- **reviewer** is read-only on both the project and the tracker — it returns findings as discussion;
  nothing is filed until the user runs `tasks-create`.

## 4. The CLI is the source of truth for its own surface

`taskmgr commands [--json]` emits a machine-readable catalog of every command, flag, and example,
derived from the live command tree. The skill teaches the model and the verbs but points at that
catalog for exact flags rather than restating the full command reference — so the skill stays small
and cannot drift from the tool. taskmgr-specific gotchas that are *not* obvious from the catalog
(closure not gated, `create --json` returns id-only, `--parent` is organizational, no `list --parent`
flag) are captured in the skill's section 7.

## 5. taskmgr is a CLI dependency — runtime check, not `plugin.json`

The skill requires the `taskmgr` binary and a `.tasks/` store. The harness cannot install CLI
binaries, so this is enforced with a use-time runtime check that stops with guidance if either is
missing — the same pattern `project-explore` uses for its CLI prerequisite. Do **not** add a
`dependencies` entry for `taskmgr` in `plugin.json`; that field declares plugin-on-plugin
dependencies only.

## 6. Anchored on the binary name `taskmgr`

The upstream project is checked out as `agent-tasks-control`, titled `task-manager`, and its Go
module is `github.com/hk9890/task-manager` — but the installed binary is `taskmgr`. The skill
references `taskmgr` throughout, since that is the stable name an agent actually invokes.
