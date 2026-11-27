# Overview

REST API for widget inventory. Exposes CRUD endpoints over HTTP/JSON backed by PostgreSQL.

## Repository layout

```
cmd/server/             entrypoint, dependency wiring
internal/api/           HTTP handlers (Chi router)
internal/store/         PostgreSQL repository layer
internal/model/         shared domain types
migrations/             schema migrations (goose)
api/openapi.yaml        OpenAPI spec (rendered at https://api.acme.com/widget-service/docs)
docs/user/              user-facing documentation (published to https://docs.acme.com/widget-service)
docs/runbooks/          operational runbooks for on-call
```

## Finding things

```bash
rg -n '\br\.(Get|Post|Put|Patch|Delete|Head|Options|Method(Func)?|Handle(Func)?|Mount)\(' -g '!*_test.go' internal/api/   # every endpoint the service serves
rg -n 'func \(s \*Store\)' internal/store/                   # every database operation
rg -n 'type \w+ struct' internal/model/                     # the domain types
rg -n '<column-name>' migrations/                           # when a column was added, and by which migration
```

## External resources

| Resource | URL |
|----------|-----|
| Shared platform libs (auth, tracing) | https://github.com/acme/platform-libs |
| Ops repo (deploy config, ArgoCD) | https://github.com/acme/ops — `deploy/widget-service/` |
| PostgreSQL driver docs | https://pkg.go.dev/github.com/jackc/pgx/v5 |
| Chi router docs | https://pkg.go.dev/github.com/go-chi/chi/v5 |
