# Running

How an agent launches and drives the widget-service by hand to reproduce a reported bug
or verify a change. For the automated suites and gates see [TESTING.md](TESTING.md); for
the evidence trail of what already happened (logs, spans, metrics) see
[MONITORING.md](MONITORING.md). For the generic launch-and-drive flow use the built-in
`run` and `verify` skills — this file records only what is specific to this service.

## Launch locally

```bash
docker compose up -d db        # Postgres on :5432
make run                       # service on :8080, reads DATABASE_URL from .env
```

Wait for `GET /healthz` to return `200` before driving — it returns `503` until the DB
connection is live.

## Drive it

```bash
# Seed a widget, then read it back by the UUID assigned on creation
id=$(curl -s localhost:8080/widgets -d '{"name":"bolt","quantity":12}' | jq -r .id)
curl -s "localhost:8080/widgets/$id"
```

The service is agent-driven over HTTP via `curl`/`httpie`; there is no UI, so a human
would exercise the same endpoints.

## Reproduce a reported bug

1. Launch as above.
2. Replay the exact request from the report (method, path, body, headers).
3. If the report came from production, recover the triggering input by matching its
   `trace_id` against the logs described in [MONITORING.md](MONITORING.md).

## Verify a fix

Re-issue the request that failed and confirm the corrected response and status code; for
a data change, read the row back with `GET /widgets/{id}`.
