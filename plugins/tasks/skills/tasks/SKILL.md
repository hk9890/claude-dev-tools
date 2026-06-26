---
name: tasks
description: "How to use taskmgr — the file-based task tracker: its data model, core commands, and tracking discipline."
when_to_use: "Use when working with a taskmgr / .tasks tracker — creating, finding, updating, or closing tasks via the taskmgr CLI, or deciding what to work on next from its ready queue. Triggers on 'taskmgr', 'task manager', 'the .tasks store', 'create a task / file a bug / open an epic', 'what's ready to work on'. Does not apply to the harness's built-in TaskCreate/TaskList tools or TodoWrite."
---

# Using taskmgr

`taskmgr` is a lean, file-based task tracker: issues, dependencies, and ready-work as
Markdown files under a `.tasks/` directory, versioned alongside the code. You operate it
**only** through the `taskmgr` CLI — the `.tasks/` directory is an internal store, never a place to
read or edit by hand. Do **not** `cat`, `grep`, `ls`, or write the files under `.tasks/` directly:
the CLI holds the write lock, resolves the store by walking up from any subdirectory, and emits
stable `--json`. Touching the files directly bypasses the lock (risking corruption), misses stores
that live above the current directory, and couples you to a format that can drift. This skill covers
the model and the discipline; for the exact flag surface, ask the tool itself (see "Source of
truth" below).

## 1. Is taskmgr available?

Before using the tracker, confirm the binary and a store exist — probe them **separately** so the
two failure modes stay distinct:

```bash
command -v taskmgr >/dev/null 2>&1   # 1) is the binary installed?
taskmgr list >/dev/null 2>&1          # 2) does a store resolve? (taskmgr walks up from cwd to find .tasks/)
```

- **`command -v taskmgr` fails** → no binary. Stop and tell the user to install it (`make install`
  from the task-manager repo). Do not fall back to TodoWrite or markdown files for tracking.
- **Binary present but `taskmgr list` fails** → no store resolves from here. Offer to create one with
  `taskmgr init --prefix <p>` (prefix defaults to a slug of the directory name).

Do **not** test for the store with `ls .tasks/`: the store is found by walking **up** from the
current directory, so a bare `ls` in a subdirectory reports "no store" even when taskmgr resolves one
at the repo root — and would then create a second, nested store. Let `taskmgr list` do the
resolution, and commands then work from any subdirectory of the project.

## 2. Source of truth for commands

`taskmgr` self-describes — do not guess flags or rely on memory for the exact surface:

```bash
taskmgr commands --json    # machine-readable catalog: every command, flags, examples
```

This catalog is derived from the live command tree and never drifts. Add `--json` to **any**
command for stable `snake_case` output — that is the contract for agents; parse it rather
than scraping the human table. Errors go to stderr prefixed `taskmgr: `; exit `0` = success,
`1` = any error.

## 3. The data model

| Field | Values |
|---|---|
| **type** | `task` (default), `bug`, `feature`, `epic`, `chore` |
| **status** | `open`, `in_progress`, `blocked`, `deferred`, `closed` |
| **priority** | `0` critical, `1` high, `2` normal (default), `3` low, `4` trivial — numeric only |

Three kinds of relationship between issues:

- **parent** — grouping under an epic (one parent per issue).
- **blocked-by** — a hard dependency; the blocked issue is not *ready* until every blocker
  closes. Acyclic and enforced.
- **related** — a non-blocking, **symmetric** link (set on one side, shown from both).

Two derived views fall out of the dependency graph:

- **ready** — `open` with no open blockers: the work you can start right now.
- **blocked** — non-closed with at least one open blocker.

## 4. Core workflow

```bash
# Create — title is the only required field
taskmgr create --title "Fix drill navigation" --type bug --priority 1
taskmgr create --title "Wire up export" --parent proj-0007 --blocked-by proj-0040 --label area:export

# Find work
taskmgr ready                       # what can I start now? (priority, then oldest)
taskmgr show proj-0042              # full detail: fields, edges, description, comments
taskmgr blocked                     # what's waiting, and on what

# Progress an issue
taskmgr update proj-0042 --status in_progress
taskmgr update proj-0042 --add-label needs-review --priority 0
taskmgr close  proj-0042 --reason "fixed in <commit>"

# Edges after the fact
taskmgr dep add proj-0051 proj-0047   # proj-0051 is blocked by proj-0047
taskmgr rel add proj-0042 proj-0012   # symmetric related link

# Notes
taskmgr comment add proj-0042 "Repro only on the cold-start path."
```

`close --reason` records *why*; a bare `update --status closed` closes without a reason —
prefer `close --reason`. Setting a non-closed status on a closed issue reopens it onto that
status.

To turn findings from the current conversation (a review, `/code-review`, `/simplify`, an
exploration) into issues with a standard body template, run `/tasks-create` — it owns the task-body
contract, so prefer it over hand-rolling `create` calls for review findings.

## 5. Finding work with filters

`list -q` takes a filter expression — `<field> <op> <value>` joined with `&&`, `||`, `!`,
and parentheses. Closed issues are excluded unless the expression selects them or you pass
`--all`.

```bash
taskmgr list -q 'status == "open" && priority <= 1'
taskmgr list -q 'type == bug && label ~ "area:db"'
taskmgr list -q 'ready && priority <= 2'
taskmgr list -q 'text ~ "drill" && !blocked'
taskmgr search "export schema"        # shorthand for text ~ "export schema"
```

Catalog commands — `taskmgr labels`, `taskmgr statuses`, `taskmgr types` — list the valid
values in use when you need them.

## 6. Discipline: the tracker reflects reality

- **Keep it honest.** When scope changes, a decision is made, or direction shifts, update the
  relevant issue immediately — edit the description, create follow-up issues, or close what
  became irrelevant. A stale task misleads everyone who reads it next.
- **Close with a reason** so the history explains itself.
- **Don't reopen finished work to capture new findings** — file a new issue and link it. The
  closed record stays a faithful account of what happened.

## 7. taskmgr specifics every agent must know

Non-obvious facts about *this* tracker — internalize them before automating against taskmgr.

**Closure is NOT gated — ordering is your responsibility.** `taskmgr close` never refuses: closing
an issue with open blockers succeeds, and closing an *epic with open children* succeeds. taskmgr
enforces no dependency-ordered or parent-before-child closure. If you need a gate ("don't close the
epic until its children are closed"), check it yourself first:

```bash
# empty result ⇒ every child is closed (substitute the real epic id)
taskmgr list -q 'parent == "<epic-id>" && status != "closed"' --json
```

IDs are **opaque short codes** (e.g. `proj-o623mw`), not sequential numbers — never invent one like
`proj-0007`; take it from `create --json` or `show`. Do **not** infer "all children closed" from
`show <epic>` — its child list omits closed children, so an empty list is ambiguous (all-done vs.
never-had-children). Always use the `list -q` check above, and treat an empty result as "all closed"
only once you have confirmed the query ran without error.

**Concurrent writes are safe.** The store serializes writes through `.tasks/.lock`, so several agents
may `create`/`update`/`close`/`comment` at once without corrupting it. There is no need for a
single-writer orchestrator.

**Other gotchas:**

- `create --json` returns the new **id only** — re-`show <id>` if you need its type or priority back.
- `--description` and `--description-file` are mutually exclusive on a single call. Use
  `--description-file -` to pipe a multi-line body from stdin.
- `--parent` is an **organizational** link (grouping under an epic), not a blocker. For execution
  order, use `dep add <dependent> <blocker>`.
- Dependencies are **type-agnostic** — any issue can block any other.
- There is no `list --parent` flag. Filter by parent with `list -q 'parent == "<id>"'` (`parent`
  supports equality only, not `~`).
