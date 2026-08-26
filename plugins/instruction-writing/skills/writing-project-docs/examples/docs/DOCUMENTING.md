# Documenting

How documentation is written in this repository. The generic standard — which file owns what, and
the authoring rules — is the `instruction-writing:writing-project-docs` skill; this file records
only the local delta, and wins where the two conflict.

## Gates

- `make docs-lint` runs markdownlint and the link checker over `docs/` and every root `*.md`. Run
  it before pushing a doc change — it is not in the PR check list, so nothing else catches a dead
  link.
- Cite a source symbol, never a line number — `internal/store/widget.go` and `Store.GetWidget`, not
  `widget.go:42`. Line numbers move and the citation goes on reading as if it were true.

## Doc trees outside the canonical set

- `api/openapi.yaml` is the API reference and the only home for an endpoint, a field, or a status
  code. Every doc links to it; [REVIEWING.md](REVIEWING.md) carries the rule that keeps it current.
- `docs/adr/` holds one numbered file per accepted architecture decision, never edited after
  acceptance. Supersede one by adding a `Superseded by ADR-nnn` line to it and writing the new ADR.

## Decisions

What this service has decided not to document, and why. Re-open one here rather than filling the
gap somewhere else.

- **No prose architecture doc.** `docs/OVERVIEW.md` maps the packages and stops. The layer
  boundaries are stated in `docs/CODING.md` and blocking at review ([REVIEWING.md](REVIEWING.md));
  a third copy in prose would only drift from both.
- **No endpoint list in prose.** `api/openapi.yaml` is the single home for the API surface. The
  list that used to sit in `README.md` disagreed with the handlers twice and was removed.
- **The hotfix release path stays undocumented.** [RELEASING.md](RELEASING.md) covers the normal
  release. The hotfix path has run twice in three years, and both times the on-call engineer paged
  the maintainer anyway.
