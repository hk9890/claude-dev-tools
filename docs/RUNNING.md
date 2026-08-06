# Running a Plugin

How to launch this marketplace's plugins and drive them by hand to reproduce a bug or verify a change. The built-in `run` skill carries the generic launch-and-drive flow; this file records only the local delta. For the automated suites see [TESTING.md](TESTING.md), for usage analysis [MONITORING.md](MONITORING.md).

## Launch all plugins locally

`scripts/claude-dev` starts Claude Code with every plugin in `plugins/` loaded via `--plugin-dir`, forwarding further arguments to `claude` unchanged.

```bash
./scripts/claude-dev -p "<prompt describing the use case>"   # headless: one turn, result on stdout
./scripts/claude-dev                                          # interactive TUI (human)
```

An agent drives the plugins with the first form — `-p` writes the reply to stdout, which is what the `Bash` tool returns. The bare form is interactive and cannot be driven from a tool call.

## Drive a plugin to reproduce or verify

- **Skills** — invoke by *describing the use case*, not by name; confirm it triggers, then check the output.
- **Hooks** — only `keep-awake-linux` ships them (`plugins/keep-awake-linux/hooks/hooks.json`, five events on `bin/keep-awake`). Perform the action that should fire one, then confirm its effect with the plugin's own `keep-awake-inspect` skill rather than by reading the hook definition.

To **reproduce a reported bug**, drive the exact path from the report; where it came from a real session, the transcripts in [MONITORING.md](MONITORING.md) help recover the input that triggered it. To **verify a change**, re-drive that path afterwards, and for structural changes also run the checks in [TESTING.md](TESTING.md).
