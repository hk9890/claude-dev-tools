# Coverage-summary contract

The `test-tests` audit mutates production code and checks that the suite fails. To
do that safely it must know which lines the tests actually execute — so it needs
line coverage. **The audit never parses coverage formats itself.** Instead, the
**target repository provides a command** that emits a coverage summary as JSON on
stdout, in the neutral schema below. This is what keeps the plugin
technology-independent: every format-specific detail lives in the repo, not here.

## The contract

1. The repository documents — where it documents its test command (testing /
   contributor / agent docs, README, task files) — **a command that prints a
   coverage summary as JSON to stdout**. It may compute coverage fresh or `cat` a
   file the repo maintains; the audit only needs a runnable command.
2. The audit discovers that command, runs it, and pipes the output through
   `scripts/validate-coverage-summary.py`, which validates conformance and emits a
   normalized summary. Non-conforming output is treated as *coverage unavailable*
   and the audit aborts with a remediation report — it never mutates on coverage it
   could not validate.

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

Write a small one for your stack: run your suite with coverage, take whatever
coverage artifact your toolchain already produces, and translate it to the schema
above. It is a pure data transform — no dependency on this plugin — and once
documented, every future audit reuses it. The audit's abort report points here when
the command is missing or its output does not conform.
