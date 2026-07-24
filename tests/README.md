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

Test scripts resolve the scripts they test via `git rev-parse --show-toplevel`:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/<plugin-name>/.../scripts/<name>"
```

This keeps tests location-independent and works from any CWD inside the repo.
