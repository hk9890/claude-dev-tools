# Running a Plugin

How to launch this marketplace's plugins and drive them by hand to reproduce a bug or
verify a change. For the automated suites and validators see [TESTING.md](TESTING.md);
for session-log and usage analysis see [MONITORING.md](MONITORING.md). For the generic
launch-and-drive flow, use the built-in `run` skill — this file records only what is
specific to this repo.

## Launch all plugins locally

`scripts/claude-dev` starts Claude Code with every plugin in `plugins/` loaded via
`--plugin-dir`, and forwards any further arguments to `claude` unchanged.

```bash
./scripts/claude-dev -p "<prompt describing the use case>"   # headless: prints the result to stdout
./scripts/claude-dev                                          # interactive TUI (human)
```

An agent drives the plugins with the first form: `-p` runs one non-interactive turn and
writes the reply to stdout, which is what the `Bash` tool returns. The bare form is an
interactive session and cannot be driven from a tool call.

## Drive a plugin to reproduce or verify

Exercise the component directly:

- **Skills** — invoke by *describing the use case* (not by name), confirm it triggers,
  then check the output.
- **Hooks** — only `keep-awake-linux` ships them
  (`plugins/keep-awake-linux/hooks/hooks.json`, five events on `bin/keep-awake`). Perform
  the action that should fire one, then confirm its effect with the plugin's own
  `keep-awake-inspect` skill rather than by reading the hook definition.

To **reproduce a reported bug**, drive the exact path from the report; if it came from a
real session, the transcript and usage signals in [MONITORING.md](MONITORING.md) can help
recover the input that triggered it. To **verify a change**, re-drive the same path after
the change, and for structural changes also run the automated checks in
[TESTING.md](TESTING.md).
