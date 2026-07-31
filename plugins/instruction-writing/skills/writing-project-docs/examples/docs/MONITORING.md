# Monitoring

## Metrics

Prometheus metrics exposed at `GET /metrics`.

| Metric | Labels | Description |
|--------|--------|-------------|
| `widget_requests_total` | method, path, status | HTTP request count |
| `widget_db_query_duration_seconds` | query | DB query latency histogram |

## Logs

Structured JSON via `slog`. Level controlled by `LOG_LEVEL` env var (default: `info`).

Key fields: `trace_id`, `widget_id`, `method`, `path`, `duration_ms`.

## Health check

```
GET /healthz   → 200 OK when DB connection is live
               → 503 Service Unavailable otherwise
```

## Dashboards

Grafana dashboard source: `monitoring/grafana/widget-service.json`

Import it into the shared Grafana instance to get request rate, error rate, and DB latency panels.
