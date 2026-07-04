---
name: tasks-create
description: "Turn findings from the current conversation into well-formed taskmgr issues — classified by type with a standard body."
user-invocable: true
disable-model-invocation: true
---

# Creating tasks from findings

Turn the findings already present in **this conversation** — a code review, a `/simplify` pass, an
exploration, a design discussion — into well-formed `taskmgr` issues. This skill is the single
source of truth for how a finding becomes a task: follow it, do not invent your own body shape.

**Scope (optional):** anything passed after the command narrows which findings to file — read it
together with step 2.

$ARGUMENTS

## 1. Preconditions

First, **load the `tasks` skill** for the CLI surface and the taskmgr gotchas (closure is not gated,
`--description-file -`, `create --json` returns id-only) — this skill relies on them.

Then confirm the tracker is usable before creating anything — probe binary and store separately
(`taskmgr list` resolves the store by walking up; do **not** use `ls .tasks/`, which only sees cwd
and would miss a store at the repo root):

```bash
command -v taskmgr >/dev/null 2>&1   # binary installed?
taskmgr list >/dev/null 2>&1          # store resolves?
```

If `command -v taskmgr` fails (no binary) or `taskmgr list` fails (no store resolves), stop and
follow the failure guidance in the `tasks` skill ("Is taskmgr available?") — for a missing store,
continue once `taskmgr init` has created one.

## 2. Gather the findings

Collect the actionable findings from the current conversation. A finding is anything with a
location, a problem, and an implied fix — a review finding, a failing check, a simplification
opportunity, a flaw raised in discussion.

**Honor the user's scope.** `/tasks-create` may carry an instruction ("only the critical findings",
"just the auth bugs", "make chores for the cleanups"). Create tasks for exactly that subset. With no
scope given, list the candidate findings and confirm which to file before writing anything.

## 3. Classify each finding by nature

The *nature* of the finding picks the type — not its source. `/code-review` and `/simplify`
findings are classified the same way as anything else.

| Type | Use when the finding is | Examples |
|---|---|---|
| `bug` | something is broken vs. intended behavior | a defect, a wrong result, a crash, a failing test |
| `chore` | cleanup with no behavior change | a simplification, a refactor, dead-code removal, a rename |
| `task` | actionable work that is neither | a missing capability, a follow-up investigation |

If one finding is both ("this is broken *and* the surrounding code should be simplified"), file the
defect as a `bug` and the cleanup as a separate `chore`. One problem per issue; batch several
instances of the *same* fix into one issue.

## 4. Map severity to priority

`taskmgr` priorities are numeric `0`–`4`. Map the finding's severity:

| Severity | Priority |
|---|---|
| critical / blocker | `0` |
| high | `1` |
| medium / normal | `2` |
| low | `3` |
| trivial / nit | `4` |

## 5. Write the standard body

Every created issue uses this body — no variations:

```markdown
## Context
<where: file:line, component, or the review/conversation that produced this>

## Problem
<what is wrong and why it matters — the finding, stated concretely>

## Recommended action
<the concrete change to make>

## Acceptance criteria
- [ ] <testable check>
- [ ] <testable check>
```

For a `chore`, "Problem" describes the complexity or debt and "Recommended action" the
simplification — the skeleton is identical.

Acceptance criteria must be **testable**: a command to run, an observable result, a check that
passes. "Works" or "looks right" is not acceptance criteria. If a finding has no testable
criterion, say so and ask the user rather than inventing one.

## 6. Create the issues

Pipe the body via stdin (`--description-file -`); the title is short and imperative:

```bash
cat <<'EOF' | taskmgr create --title "Return 401 on expired JWT" --type bug --priority 1 --description-file -
## Context
src/middleware/auth.ts:42 — flagged in code review.

## Problem
An expired token is treated as valid: the exp claim is parsed but never compared to now, so expired
sessions keep working.

## Recommended action
Compare exp against the current time and reject when past; return 401.

## Acceptance criteria
- [ ] A request with an expired token returns 401
- [ ] A request with a valid token still succeeds
- [ ] Relevant middleware tests pass
EOF
```

Add `--label area:<x>` for routing when useful, `--parent <epic>` to group under an epic, and
`--blocked-by <id>` for a real ordering constraint. `create --json` returns the new id only.

## 7. Report

List what you created — `id`, type, priority, title — so the user can see the result and run
`taskmgr ready`. If you skipped any candidate findings (out of scope, or no testable criterion),
say which and why. Do not close or modify any existing issue from this skill — it only creates.
