**Title:** Design: stream CSV exports instead of buffering them
**Type:** `doc` — **Label:** `kind:design`

A doc is not work. It carries a document, so it has no *Problem* and no *Acceptance criteria*: the
headings below belong to this design page, not to a template. Its status and priority are stored
and mean nothing.

## Decision

Write CSV rows to the response as the database cursor yields them. Do not build the file in memory
and do not stage it on disk.

## Why

The largest pull support has run by hand is the `acme` audit log: 214k rows, 96 MB as CSV. The
current `/api/orders?format=csv` path materialises the whole result set before writing a byte, so
that request needs about 1 GB of heap on a 512 MB pod:

```
$ curl -s -o /dev/null 'localhost:3000/api/orders?format=csv&tenant=acme'
curl: (52) Empty reply from server
$ kubectl describe pod api-7d4f | grep -A2 'Last State'
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
```

Streaming makes peak memory a function of the page size, not of the export size.

## Consequences

- The response cannot carry a `Content-Length`, so the browser shows no progress bar. Support was
  asked and prefers a download that completes to one that reports progress and dies.
- An error after the first row arrives mid-file. The file ends without its terminator, which the
  client cannot distinguish from a truncated transfer.
- Tenant scoping now runs once per page rather than once per request. The scoping test has to move
  to the page boundary or it stops proving anything.

## Rejected

**Stage the file in object storage and return a signed URL.** It survives a restart and carries a
progress bar. It also adds a bucket, a lifetime policy, and a second place a tenant's rows exist —
too much for the first export slice. Revisit if scheduled exports are ever wanted.
