**Title:** Collapse the three date formatters into one helper
**Type:** `chore` — **Priority:** `3`

## Context

`src/export/csv.ts:88`, `src/report/pdf.ts:31`, `src/ui/DateCell.tsx:12` — three separate
implementations of the same `YYYY-MM-DD` formatting.

## Problem

All three produce identical output today; the duplication itself is the cost. A format change has
to find three call sites, and the last one — adding UTC normalisation — updated two of them and
missed `DateCell.tsx`, which was caught in review rather than by a test.

## Recommended action

Extract one `formatDate(d: Date): string` into `src/lib/date.ts`, replace the three call sites with
it, and delete the originals. Output stays byte-identical; this changes no behaviour.

## Acceptance criteria

- [ ] `git grep -n 'toISOString().slice' -- src/` prints nothing — the three inline formatters are gone
- [ ] `npm test` passes with no test file modified
- [ ] Exporting the fixture in `test/fixtures/orders.json` produces a CSV byte-identical to the one
      committed at `test/golden/orders.csv`
