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

Structured JSON on each pod's stdout, collected by the OneAgent. Read them in DQL:

```
fetch logs | filter k8s.deployment.name == "widget-service" | filter loglevel == "ERROR"
```

Filter by `trace_id` to follow one request.

## Dashboards

The `widget-service` dashboard is in `https://abc12345.apps.dynatrace.com`. Its source is
`monitoring/dynatrace/widget-service.json`.
