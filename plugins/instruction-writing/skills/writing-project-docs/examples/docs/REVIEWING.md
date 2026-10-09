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

## Quality rules

How finished code must look. Each rule is a condition to check on the diff, with the
correct form.

- **Error wrapping**: an error that leaves `internal/store/` names the operation that
  failed — `fmt.Errorf("get widget %s: %w", id, err)`. Flag a bare `return err` there.
- **Comments**: an exported type in `internal/model/` carries a doc comment that states
  its invariant — `// Widget is immutable once Archived is set.` Flag a missing one, and
  any comment that only restates the code under it.
- **Naming**: a `Store` method is `<Verb><Noun>` with the verbs `Get`, `List`, `Create`,
  `Update`, `Delete` — `ListWidgets`, never `FetchAllWidgets`.

## Project-specific rules

- Every new endpoint needs an integration test in `internal/store/integration_test.go`
  (see [TESTING.md](TESTING.md)).
- Any change to the public API must update `api/openapi.yaml` in the same PR.
- New `internal/store/` methods must have a mock regenerated via `make generate` —
  flag a stale `internal/mocks/`.

## Out of scope / non-blocking

- Code style and formatting are handled by `make lint` (golangci-lint); do not
  re-flag what the linter owns.
- A naming preference no rule above states is a non-blocking suggestion, not a
  review blocker.
