# Coding

Repository-specific implementation constraints.

## Building from source

```bash
git clone https://github.com/acme/widget-service.git
cd widget-service
make dev-db    # start Postgres via Docker Compose
make run       # start server on :8080
```

## Layer boundaries

- HTTP handlers live in `internal/api/`; no DB access there.
- All SQL lives in `internal/store/`; no business logic there.
- `internal/model/` holds shared types; no logic, no DB imports.

## Adding an endpoint

1. Define the handler in `internal/api/handlers.go`.
2. Register the route in `internal/api/router.go`.
3. If DB access is needed, add a method to `internal/store/store.go`.

## Code generation

```bash
make generate   # regenerates mocks under internal/mocks/
```

Re-run after changing any interface in `internal/store/` or `internal/api/`.

## Linting

```bash
make lint       # golangci-lint with repo config at .golangci.yml
```

Lint must pass before opening a PR.
