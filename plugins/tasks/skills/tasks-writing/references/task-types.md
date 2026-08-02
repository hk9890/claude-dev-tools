# Task types

Five types. The *nature* of the work picks one — where it was discovered (a review, a failing
build, a design discussion) picks nothing.

| Type | The work is |
|---|---|
| `bug` | behaviour that is wrong against what was intended |
| `feature` | a capability that does not exist yet |
| `chore` | a change that leaves behaviour identical — cleanup, refactor, dependency bump |
| `task` | actionable work that is none of the above — an investigation, a migration step, a decision |
| `epic` | a container for other issues; it holds no implementation of its own |

When a finding is both a defect and untidiness around it, the defect is a `bug` and the cleanup a
separate `chore`. Batching them hides one behind the other's done-state. Several instances of the
*same* fix are one issue, not one per call site.

## `bug`

**Use when** observed behaviour differs from intended behaviour and you can state both halves.

**Inside:** the repro — exact steps or a command anyone can run; the observed output, pasted; the
expected output; the anchor (`file:line`, endpoint, symbol) when you have it.

**Not inside:** a diagnosis you have not verified. A confident wrong cause sends the implementer
down it and costs more than no cause at all. If you have a hypothesis, mark it as one.

## `feature`

**Use when** the capability does not exist and someone has asked for it.

**Inside:** who wants it and what they do with it; the user-visible behaviour once it exists; the
edge of this slice — what is explicitly out.

**Not inside:** internal design that has not actually been decided. An invented structure reads as
a requirement and the implementer will build it. State constraints instead, and let the design be
made where it is made.

## `chore`

**Use when** the change leaves behaviour identical.

**Inside:** what is untidy and the cost it imposes *now*; the shape afterwards; the evidence that
behaviour did not move — the tests or command output that must be unchanged.

**Not inside:** a behaviour change smuggled along for the ride. The moment behaviour moves, it is a
`bug` or a `feature` and gets its own issue.

## `task`

**Use when** the work is neither broken, nor new capability, nor pure cleanup — an investigation, a
spike, a migration step, a decision to be made.

**Inside:** the question to answer or the step to take, and the **output** that ends it — a written
finding, a decision recorded, a filed follow-up, a config change.

**Not inside:** an open-ended "look into X". A task with no stopping condition never closes.

## `epic`

**Use when** several issues share one outcome worth tracking on its own.

**Inside:** the outcome in user-visible terms; its own success criteria; the children.

**Not inside:** implementation, and "all children are closed" as the success criterion. Children
closing is a precondition, not evidence the outcome was reached — an epic can have every child
closed and still not deliver what it promised.

## Priority

`0`–`4`, numeric. Priority is the consequence of *not* doing the work, not how much it irritates
you.

| | Means |
|---|---|
| `0` | critical — something is on fire; other work stops |
| `1` | high — real user or developer pain right now; next in line |
| `2` | normal — the default; it should happen, nothing breaks meanwhile |
| `3` | low — worth doing when that area is open anyway |
| `4` | trivial — a nit; leaving it closed-as-wontfix would be fine |

When everything is `0` or `1`, the scale has stopped carrying information and the queue is ordered
by whoever shouted last.
