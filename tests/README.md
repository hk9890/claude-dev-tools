# tests

Marketplace-level tests for the plugins in this repo. Tests live here (outside `plugins/`) so they do not ship with the plugin payload when installed via `/plugin install`.

## Layout

```
tests/
├── run-all.sh                       <- the runner: discovers and runs every suite
├── <plugin-name>/
│   └── script-tests/
│       └── test-*.sh                <- individual test suites
└── ...
```

`run-all.sh` is the only runner: it discovers every `test-*.sh` at
`tests/<plugin>/script-tests/` and classifies exit codes in one place, so there are no
per-plugin runners to keep in sync.

A plugin gets a `tests/<plugin-name>/script-tests/` subdir only when it ships committed scripts to test (e.g., bash helpers, python utilities); plugins without script-level tests have no directory here — do not create empty placeholders.

`tests/marketplace/` is the exception: it is not a plugin but holds repo-level tests (e.g., for `scripts/check-internal-consistency.py`, the marketplace-manifest validator). It follows the same `script-tests/` layout as the per-plugin directories.

## Running

```bash
# All plugins
bash tests/run-all.sh

# One plugin
bash tests/run-all.sh project-review

# One suite
bash tests/project-review/script-tests/test-manifest.sh
```

## Path resolution in test scripts

Test scripts resolve the scripts they test via `git rev-parse --show-toplevel`, anchored on
the suite's own directory with `git -C`:

```bash
REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/plugins/<plugin-name>/.../scripts/<name>"
```

This keeps tests location-independent and works from **any** CWD, inside the repo or not —
`run-all.sh` resolves itself from `${BASH_SOURCE[0]}` too, so a suite and the runner that
discovered it always agree on which checkout is under test.

The `-C` is load-bearing. A bare `git rev-parse --show-toplevel` resolves against the
caller's CWD: run from outside any repo it fails and leaves `REPO_ROOT` empty, and run from
inside a *different* checkout or a nested `.claude/worktrees/` worktree it returns that
tree's root — so the suite would assert against a tree the runner never scanned and report
the result against the wrong one.

The emptiness guard is load-bearing too. Suites set `-uo pipefail`, not `-e` (see below), so
an unresolvable root is not fatal on its own; every path would become `/plugins/...` and the
suite would emit a cascade of bogus "file missing" failures blaming the plugin. The guard
turns that into one failure that names the real cause.

## Shell options in test scripts

Test scripts set `set -uo pipefail`, never `-euo`: this matches `run-all.sh` and the
`PASS`/`FAIL`-counting design every suite uses, where a failed assertion must not abort
the script before the `Results: N passed, N failed` summary prints.
