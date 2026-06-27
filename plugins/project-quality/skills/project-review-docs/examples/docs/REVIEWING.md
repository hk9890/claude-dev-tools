# Reviewing

Project-specific review rules. The generic review lenses (complexity, structure,
consistency, tests, docs) are covered by the `project-review-*` skills — this file
records only the local delta. Where it conflicts with a skill's default, this file wins.

## What to prioritise

- **Layer boundaries** (see [CODING.md](CODING.md)): flag any DB access in
  `internal/api/`, any business logic in `internal/store/`, and any DB import in
  `internal/model/`. These are blocking.
- **Transaction safety**: every mutation that touches more than one table must run
  in a single transaction. A multi-write handler without one is a blocking finding.

## Project-specific rules

- Every new endpoint needs an integration test in `internal/store/integration_test.go`
  (see [TESTING.md](TESTING.md)).
- Any change to the public API must update `api/openapi.yaml` in the same PR.
- New `internal/store/` methods must have a mock regenerated via `make generate` —
  flag a stale `internal/mocks/`.

## Out of scope / non-blocking

- Code style and formatting are handled by `make lint` (golangci-lint); do not
  re-flag what the linter owns.
- Naming preferences that the linter accepts are non-blocking suggestions, not
  review blockers.
