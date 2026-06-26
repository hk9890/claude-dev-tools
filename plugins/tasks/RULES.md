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
- **Execution orchestration** — the `tasks-work` skill confirms scope, then the bundled `work.js`
  workflow runs the `ready → implement → verify(review ∥ test) → record` loop and verifies the parent
  epic. The loop is a thin, deterministic workflow script, not a methodology document.

It deliberately still does **not** port the `beads-tasks` methodology wholesale: no planning/work
intake documents, no serialized-writes orchestrator protocol, no acceptance-review *task* pattern.
`taskmgr` is a tracker; how a session sequences work on top of it is kept as a thin, explicit
workflow rather than a heavy methodology.

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
- **reviewer** (`project-quality:project-reviewer` — a sibling plugin; the `tasks` plugin ships no
  reviewer of its own) is read-only on both the project and the tracker — it returns findings as
  discussion; nothing is filed until the user runs `tasks-create`.

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

## 7. The execution workflow (`work.js`) — design decisions

`tasks-work` ships a workflow script at `workflows/work.js`, run via the Workflow tool by `scriptPath`
(`${CLAUDE_PLUGIN_ROOT}/workflows/work.js`). `workflows/` is not an auto-discovered plugin component
directory — the script is a bundled data file the skill points the tool at, with scope resolved in the
main loop and passed as `args.taskIds` / `args.epicId`. A workflow script is pure JS and cannot run
`taskmgr`; every tracker read/write happens inside a spawned agent. Key choices:

- **Closure detection is explicit, because taskmgr does not gate it (rule 2).** Per-task records are
  collected by running each task's pipeline to completion; only then does one epic agent assert all
  children closed via `list -q 'parent == "<id>" && status != "closed"'` — never via `show`'s child list.
- **Epics are never auto-closed.** The epic stage verifies success criteria and posts a verdict
  comment, then leaves the epic for a human to close. This sidesteps the absent CLI guardrail.
- **Tasks run sequentially against the shared working tree.** taskmgr's lock (rule 3) protects the
  *tracker*, not project source files, so parallel implementers would clobber each other's edits and
  the verify legs would observe a commingled tree. v1 runs one task's implement → verify → record at a
  time; review ∥ test stay parallel *within* a task (its implementer has already finished) and the
  review is scoped to the task's reported `changedFiles`. Parallel implementation across isolated
  worktrees, with an integration/merge step, is a deliberate future enhancement — not v1.
- **Verify legs are report-only; a separate record stage closes.** Review (read-only) and test run in
  parallel and cannot see each other, so neither closes; the record stage closes only when the test
  passed *and* review is not `reject`. Four outcomes: closed / left-open (a verification failure — bug
  filed) / inconclusive (an agent did not complete — left open, no bug) / skipped (the ticket was
  unready or blocked — the implementer never started, no bug).
- **Soft cross-plugin dependency.** The review leg spawns `project-quality:project-reviewer`, so
  `tasks-work` (and only that skill) expects the `project-quality` plugin to be installed. It is not a
  hard `plugin.json` dependency — the rest of the `tasks` plugin works without it.
