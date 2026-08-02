**Title:** Expired access token is accepted on every endpoint
**Type:** `bug` — **Priority:** `1`

## Context

`src/middleware/auth.ts:42`, `verifyToken`. Reported by a user whose session still worked eight days
after signing out on another device; reproduced on `main` at `a1b3f90`.

## Problem

`verifyToken` reads the `exp` claim but never compares it to the current time, so any
structurally valid token authenticates indefinitely:

```
$ curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $EXPIRED_TOKEN" \
    localhost:3000/export
200
```

Expected `401`. Sessions cannot be ended — expiry is the only revocation mechanism the service has,
and it does nothing. Every issued token is effectively permanent.

## Recommended action

In `verifyToken`, compare `exp` against the current time and reject when it is in the past. Return
`401` with the existing `TokenExpired` error body; no new error type, no change to the refresh flow.

## Acceptance criteria

- [ ] The curl above returns `401`
- [ ] The same request with an unexpired token still returns `200`
- [ ] `npm test -- auth` passes, including a new case covering the expired path
