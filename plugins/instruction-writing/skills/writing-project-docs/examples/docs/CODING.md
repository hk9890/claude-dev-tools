# Coding

What a change to this repository needs in order to work.

## Building from source

```bash
git clone https://github.com/acme/widget-service.git
cd widget-service
make dev-db    # start Postgres via Docker Compose
make run       # start server on :8080
```

## Layer boundaries

| Path | Put here | Don't put here |
|---|---|---|
| `internal/api/` | HTTP handlers and the business logic they run | DB access; it goes in `internal/store/` |
| `internal/store/` | All SQL | Business logic; it goes in the handler in `internal/api/` |
| `internal/model/` | Shared types | Logic, which goes in `internal/api/`; DB imports, which go in `internal/store/` |

## Adding an endpoint

1. Define the handler in `internal/api/handlers.go`.
2. Register the route in `internal/api/router.go`.
3. If DB access is needed, add a method to `internal/store/store.go`.

## Code generation

```bash
make generate   # regenerates mocks under internal/mocks/
```

Re-run after changing any interface in `internal/store/` or `internal/api/`.

## Changing the dashboard

Upload `monitoring/dynatrace/widget-service.json` with `monitoring/deploy-dashboard.sh` after
changing it; nothing deploys it on merge.
