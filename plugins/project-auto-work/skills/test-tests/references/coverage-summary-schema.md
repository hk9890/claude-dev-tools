# Coverage-summary contract

The `test-tests` audit mutates production code and checks that the suite fails.
Which lines the tests execute is measured by the audit itself, one throw probe per
surviving mutant, so **this contract is optional**: a repository with no coverage
command is fully auditable and loses only what is listed below.

**The audit never parses coverage formats itself.** Where the target repository
provides a command emitting a coverage summary as JSON on stdout in the neutral
schema below, every format-specific detail stays in the repo, not here.

## What a conforming command buys

- **Site ranking.** Mutation sites inside `covered_ranges` are preferred, so more of
  the run lands on code the tests already reach. It is a preference, never a filter —
  an uncovered line is still a legal target.
- **`untested_churn`.** The report's pointer list of uncovered production code
  weighted by git churn. Empty without a coverage command.
- **The coverage-truth probe.** From `medium` up, a few mutants land on lines the
  summary calls uncovered. One killed there proves the command under-reports.

## The contract

1. The repository documents — where it documents its test command (testing /
   contributor / agent docs, README, task files) — **a command that prints a
   coverage summary as JSON to stdout**. It may compute coverage fresh or `cat` a
   file the repo maintains; the audit only needs a runnable command.
2. The audit discovers that command, runs it, and pipes the output through
   `scripts/validate-coverage-summary.py`, which validates conformance and emits a
   normalized summary. Non-conforming output is treated as *coverage unavailable*:
   the run continues without it, and says so in `not_checked`.

## Schema (what the command must emit)

```json
{
  "files": [
    {
      "path": "src/parser.py",
      "covered_ranges":   [[10, 25], [30, 42]],
      "uncovered_ranges": [[26, 29], [43, 50]]
    }
  ]
}
```

Rules:

- **`files`** — a non-empty array; one entry per production file with coverage data.
- **`path`** — **repo-relative**, forward-slash. Not absolute, no `..` segments. This
  is load-bearing: the audit joins these paths against the components it groups and
  the files each worker mutates, so the producer owns any normalization (stripping a
  Go module prefix, an absolute build path, a coverage tool's own prefix, etc.).
- **`covered_ranges` / `uncovered_ranges`** — arrays of `[start, end]` inclusive line
  ranges, `1 <= start <= end`. Both optional (default `[]`), but every file needs at
  least one covered or uncovered line. Ranges may be given unmerged and in any order;
  the validator merges and sorts them. If covered and uncovered overlap, covered
  wins.

Only line-level coverage is required — no branch, statement, or per-test data.

## Validating your producer

Pipe your command's output through the bundled validator to check it conforms before
wiring it into the audit:

```bash
your-coverage-summary-command | python3 scripts/validate-coverage-summary.py
```

Exit `0` prints the normalized summary (per-file and total line counts with
percentages). Exit `3` prints, on stderr, every reason the document was rejected —
fix those and re-run.

## If you have no such command yet

Nothing breaks. The audit runs, measures reachability per site, and reports the
missing command under `not_checked`.

To add one anyway: run your suite with coverage, take whatever coverage artifact your
toolchain already produces, and translate it to the schema above. It is a pure data
transform — no dependency on this plugin — and once documented, every future audit
reuses it.
