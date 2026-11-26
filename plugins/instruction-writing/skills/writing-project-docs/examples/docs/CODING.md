# Coding

What a change to this repository needs in order to work.

## Building from source

```bash
make build     # binary in bin/
```

To start the service, follow [RUNNING.md](RUNNING.md).

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

## Changing the dashboard

Upload `monitoring/dynatrace/widget-service.json` with `monitoring/deploy-dashboard.sh` after
changing it; nothing deploys it on merge.
