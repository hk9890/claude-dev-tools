**Title:** Find what doubled export p95 latency in release 2.3
**Type:** `task` — **Priority:** `1`

## Context

`/api/orders?format=csv`. Dashboard `svc-orders / latency`, comparing the week before 2.3 shipped
(`2026-05-04`) with the week after.

## Problem

p95 on the export path went from 410 ms to 890 ms across the 2.3 deploy and has stayed there. No
export-related change is in the 2.3 changelog, so the cause is not known — it may be the new
tenant-scoping middleware, the driver bump, or an unrelated traffic-mix change.

This task ends with an answer, not a fix.

## Recommended action

Bisect the 2.3 commit range against the export benchmark in `bench/export.ts`, run against the
staging dataset. Start with the two candidates above; if neither reproduces, widen to the full
range.

## Acceptance criteria

- [ ] A comment on this task names the commit (or rules out the commit range) with the benchmark
      numbers that show it
- [ ] If a commit is identified, a `bug` is filed for the fix and linked here
- [ ] If the range is ruled out, the comment says what was measured and what the next hypothesis is
