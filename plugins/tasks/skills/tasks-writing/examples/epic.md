**Title:** Self-serve data export
**Type:** `epic` — **Priority:** `2`

An epic replaces *Problem* and *Recommended action* with *Outcome* and *Success criteria*. It is
never assigned to an implementer — its children are.

## Context

The orders, invoices, and audit-log pages. Raised in the Q3 support review: manual data pulls are
the single largest category of engineer-hours spent on support tickets.

## Outcome

A user can get their own data out of the product without asking anyone. Support stops running
export queries by hand.

## Success criteria

These are checked against the shipped product, not against the children's status.

- [ ] Export is reachable from orders, invoices, and the audit log
- [ ] Support has run zero manual export queries for four consecutive weeks after ship
- [ ] An export of 50k rows completes without a timeout on the staging dataset

## Children

- Export the orders table as CSV from the orders page
- Extend export to invoices and the audit log
- Stream exports above one page of results
- Document the export format for customers

## Not in this epic

Scheduled or recurring exports, and formats other than CSV. Both were raised in the same review and
both are separate work — file them as their own epic if they are wanted.
