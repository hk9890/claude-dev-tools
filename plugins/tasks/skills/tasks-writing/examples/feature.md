**Title:** Export the orders table as CSV from the orders page
**Type:** `feature` — **Priority:** `2`

## Context

`src/ui/OrdersPage.tsx` and the `/api/orders` handler in `src/api/orders.ts`. Requested by support,
who currently answer "can I have this as a spreadsheet?" by running a query by hand — roughly twice
a week.

## Problem

There is no way for a user to get their orders out of the product. Support runs the query manually,
which takes an engineer about twenty minutes each time and has twice sent one customer's rows to
another.

## Recommended action

Add an **Export CSV** button to the orders page that downloads the rows currently in view — same
filters, same sort, same tenant scoping as the table. Reuse the existing `/api/orders` query path
so scoping cannot drift; add a `format=csv` response rather than a second query.

Out of this slice: scheduled exports, formats other than CSV, and exports larger than one page of
results. Each is its own task if it turns out to be wanted.

## Acceptance criteria

- [ ] With filters applied, clicking Export CSV downloads a file whose rows match the table exactly
- [ ] The header row uses the table's visible column labels
- [ ] A user of tenant A cannot obtain tenant B's rows by editing the request
- [ ] `npm test -- orders` passes, including a case asserting the scoping above
