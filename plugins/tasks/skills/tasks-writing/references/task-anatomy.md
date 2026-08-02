# Task anatomy

Every task carries the same four sections, same names, same order. The cold reader learns the shape
once and then knows where to look without reading the whole body.

```markdown
## Context
## Problem
## Recommended action
## Acceptance criteria
```

## What each section owns

**Context** — *where*. The anchor the reader starts from: `path/file.ext:line`, an endpoint, a
command, a symbol. One or two lines. It also records the origin when that is load-bearing evidence
("reproduced on `main` at `a1b3f90`", "reported by a user on 2.3"), and stays silent when it is not.

**Problem** — *what is wrong and what it costs*. The observed behaviour, stated concretely, and the
consequence of leaving it. This is the section that earns the task its priority; a Problem that
cannot explain the cost is a task nobody will ever pick up.

**Recommended action** — *the change to make*, at the smallest scope that satisfies the criteria.
Name the approach when it has been decided, and say so when it has not ("either X or Y; decide
during implementation"). Work that is adjacent but out of scope goes to its own task, linked — not
into a parenthetical here.

**Acceptance criteria** — *how the implementer knows they are finished*. A checklist, each item a
command to run or an observation to make. This is what a verifier executes, so it doubles as the
task's test plan.

Epics deviate: they carry **Outcome** and **Success criteria** in place of *Problem* and
*Recommended action*, because an epic is never implemented directly. See
[`../examples/epic.md`](../examples/epic.md).

## The six rules

**Cold start** — nothing in the body may point back at the conversation that produced it. No "as
discussed", no "the issue we saw yesterday", no pronoun whose referent was a message. Names, paths,
and commands survive; chat scrollback does not.

**One problem** — one problem, one done-state. If the body needs "and also", it is two tasks. The
test: could half of it be finished and closed while the other half is still open? Then split it.

**Evidence** — write what you observed, not what you concluded. Paste the actual output, the actual
error, the actual failing assertion. A described symptom ("the request seems to hang") costs the
implementer a reproduction they did not need to do.

**Testable done** — every acceptance criterion is runnable or observable by someone who was not
there.

- ✅ `GET /export with an expired token returns 401`
- ✅ `npm test -- auth` passes, including a case for the expired path
- ❌ Token handling works correctly
- ❌ The code is cleaner

If you cannot write a single testable criterion, the task is not ready to file. Say what is missing
instead of inventing one — an invented criterion gets verified, passes, and closes a task that was
never done.

**Smallest change** — the Recommended action bounds the work. An implementer follows what is
written; a body that describes a rewrite when a three-line fix would do will get the rewrite.

**Economy** — every line changes what the implementer does. Restating what the code obviously
already does, re-explaining the architecture, and hedging ("it might possibly be worth considering")
are all load with no effect. Cut whole sentences rather than trimming words from them.

## The bar

A task clears the bar when a competent stranger can open it, start work without asking a question,
and prove they are done without asking a second one.
