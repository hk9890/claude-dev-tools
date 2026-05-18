# tests

Marketplace-level tests for the plugins in this repo. Tests live here (outside `plugins/`) so they do not ship with the plugin payload when installed via `/plugin install`.

## Layout

```
tests/
├── run-all.sh                       <- top-level: runs every plugin's tests
├── <plugin-name>/
│   └── script-tests/
│       ├── run-all.sh               <- per-plugin discovery + aggregation
│       └── test-*.sh                <- individual test suites
└── ...
```

Each plugin has its own `tests/<plugin-name>/script-tests/` subdir. `script-tests/` is for testing committed scripts in the plugin (e.g., bash helpers, python utilities). Empty subdirs are fine for plugins that don't have script-level tests yet.

## Running

```bash
# All plugins
bash tests/run-all.sh

# One plugin
bash tests/project-docs/script-tests/run-all.sh

# One suite
bash tests/project-docs/script-tests/test-claude-md.sh
```

## Path resolution in test scripts

Test scripts resolve the scripts they test via `git rev-parse --show-toplevel`:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/<plugin-name>/.../scripts/<name>"
```

This keeps tests location-independent and works from any CWD inside the repo.
