# AGENTS.md — widget-service routing

## Repository purpose

REST API for widget inventory management. Go service backed by PostgreSQL.

## Use-case routing

Every route below is **mandatory, not advisory**. Load the document BEFORE the first action of that kind — loading it afterwards does not count, and no route becomes skippable because the task looks small.

### Coding and file changes

**MUST read [docs/CODING.md](docs/CODING.md) before creating or editing ANY file under `internal/` or `cmd/`.** It owns the package boundaries, the error-wrapping convention, and the rules no linter catches.

### Research, planning, analysis

**MUST read [docs/OVERVIEW.md](docs/OVERVIEW.md) before searching this repository.** It is the map — package layout, the storage boundary, and the expressions that locate things fast. Go there first instead of grepping blind.

### Testing and verification

**MUST read [docs/TESTING.md](docs/TESTING.md) before writing a test** or judging whether a change is verified. It owns the test layers, the fixtures, and the gates that must pass before you push.

### Run the service to reproduce a bug or verify a change

**MUST read [docs/RUNNING.md](docs/RUNNING.md) before starting the service locally** or driving it by hand. Pull supporting evidence from [docs/MONITORING.md](docs/MONITORING.md) when reproducing.

### Commit, branch, PR workflow

**MUST read [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) before ANY git operation** — commit, branch, push, or opening a PR.

### Reviewing changes

**MUST read [docs/REVIEWING.md](docs/REVIEWING.md) before reviewing a PR or a diff.** It carries the local review priorities and out-of-scope conventions the generic review skills cannot know.

### Release

**MUST read [docs/RELEASING.md](docs/RELEASING.md) before cutting a release** or changing what this service ships.

### Analyze logs, spans, monitoring

**MUST read [docs/MONITORING.md](docs/MONITORING.md) before interpreting logs, spans, or events** — where they land, what a healthy trace looks like, and the health checks. Reproducing a bug is driven from RUNNING.md, which pulls this doc's evidence.
