# Monitoring

## Metrics

Reported to Dynatrace by the OneAgent on each pod; query them in DQL.

| Metric | Dimensions | Description |
|--------|------------|-------------|
| `widget.requests.count` | method, path, status | HTTP request count |
| `widget.db.query.duration` | query | DB query latency histogram |

```
timeseries sum(widget.requests.count), by:{status}, from:-1h
```

## Logs

Structured JSON via `slog`. Level controlled by `LOG_LEVEL` env var (default: `info`).

Key fields: `trace_id`, `widget_id`, `method`, `path`, `duration_ms`.

## Health check

```
GET /healthz   → 200 OK when DB connection is live
               → 503 Service Unavailable otherwise
```

## Dashboards

Dynatrace dashboard source: `monitoring/dynatrace/widget-service.json` — request rate, error rate,
and DB latency tiles. Upload it with `monitoring/deploy-dashboard.sh` after changing it; the
environment is `https://abc12345.apps.dynatrace.com`.
