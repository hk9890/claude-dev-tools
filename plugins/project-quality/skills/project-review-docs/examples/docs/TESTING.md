# Testing

## Test layers

| Layer | Location | Command |
|-------|----------|---------|
| Unit | `*_test.go` next to source | `make test` |
| Integration | `internal/store/integration_test.go` | `make test-integration` |

## Integration test setup

Integration tests require a running PostgreSQL instance:

```bash
make dev-db             # start Postgres via Docker Compose
make test-integration   # run integration tests against it
```

Set `DATABASE_URL` to override the default `postgres://localhost:5432/widget_test`.

## Minimum checks before opening a PR

1. `make test` passes
2. `make lint` passes
3. If `internal/store/` changed: `make test-integration` passes
