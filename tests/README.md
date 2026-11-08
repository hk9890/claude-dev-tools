# tests

Marketplace-level tests for the plugins in this repo. Tests live here (outside `plugins/`) so they do not ship with the plugin payload when installed via `/plugin install`. The one exception is a mod's `*.test.ts`, which lives in `plugins/<plugin-name>/tests/`. How to run and write a suite: [docs/TESTING.md](../docs/TESTING.md).

## Layout

```
tests/
├── run-all.sh                       <- the runner: discovers and runs every suite
├── <plugin-name>/
│   └── script-tests/
│       └── test-*.sh                <- individual test suites
└── ...
```

`tests/marketplace/` is the exception: it is not a plugin but holds repo-level tests (e.g., for `scripts/check-internal-consistency.py`, the marketplace-manifest validator). It follows the same `script-tests/` layout as the per-plugin directories.

## Path resolution in test scripts

Test scripts resolve the scripts they test via `git rev-parse --show-toplevel`, anchored on
the suite's own directory with `git -C`:

```bash
REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/plugins/<plugin-name>/.../scripts/<name>"
```

Keep the `-C`: a bare `git rev-parse` resolves against the caller's CWD, so from a nested `.claude/worktrees/` worktree or another checkout it tests a tree the runner never scanned.

Keep the emptiness guard: suites do not set `-e` (see below), so an empty `REPO_ROOT` turns every path into `/plugins/...` and gives a cascade of false "file missing" failures.

## Shell options in test scripts

Test scripts set `set -uo pipefail`, never `-euo`: this matches `run-all.sh` and the
`PASS`/`FAIL`-counting design every suite uses, where a failed assertion must not abort
the script before the `Results: N passed, N failed` summary prints.
