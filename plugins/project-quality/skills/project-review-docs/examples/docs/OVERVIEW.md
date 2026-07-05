# Overview

REST API for widget inventory. Exposes CRUD endpoints over HTTP/JSON backed by PostgreSQL.

## Repository layout

```
src/
├── cmd/server/         entrypoint, dependency wiring
├── internal/api/       HTTP handlers (Chi router)
├── internal/store/     PostgreSQL repository layer
├── internal/model/     shared domain types
└── migrations/         schema migrations (goose)
api/
└── openapi.yaml        OpenAPI spec (rendered at https://api.acme.com/widget-service/docs)
docs/
├── adr/                architecture decision records (e.g. 0001-use-postgresql.md)
├── user/               user-facing documentation (published to https://docs.acme.com/widget-service)
└── runbooks/           operational runbooks for on-call
```

## Key concepts

- Widgets are identified by UUID; IDs are assigned on creation and never change.
- All mutations run inside a transaction; partial writes are not possible.
- Schema migrations run automatically at startup via `store.Migrate()`.
- The service is stateless — all state lives in PostgreSQL.

## External resources

| Resource | URL |
|----------|-----|
| Shared platform libs (auth, tracing) | https://github.com/acme/platform-libs |
| Ops repo (deploy config, ArgoCD) | https://github.com/acme/ops — `deploy/widget-service/` |
| PostgreSQL driver docs | https://pkg.go.dev/github.com/jackc/pgx/v5 |
| Chi router docs | https://pkg.go.dev/github.com/go-chi/chi/v5 |
