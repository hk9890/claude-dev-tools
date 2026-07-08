# Running a Plugin

How to launch this marketplace's plugins and drive them by hand to reproduce a bug or
verify a change. This is agent-facing: it records how an agent operates the plugins,
which can differ from how a human would. For the automated suites and validators see
[TESTING.md](TESTING.md); for session-log and usage analysis see [MONITORING.md](MONITORING.md).
For the generic launch-and-drive flow, use the built-in `run` and `verify` skills — this
file records only what is specific to this repo.

## Launch all plugins locally

```bash
./scripts/claude-dev
```

`scripts/claude-dev` starts Claude Code with every plugin in `plugins/` loaded via
`--plugin-dir`, so all skills, commands, and agents are available exactly as an end user
would see them — without installing anything.

## Drive a plugin to reproduce or verify

Inside that session, exercise the component directly:

- **Skills** — invoke by *describing the use case* (not by name), confirm it triggers,
  then check the output.
- **Commands** — run the slash command and check its output.
- **Hooks** — perform the action that should fire the hook and confirm it fires.

To **reproduce a reported bug**, drive the exact path from the report; if it came from a
real session, the transcript and usage signals in [MONITORING.md](MONITORING.md) can help
recover the input that triggered it. To **verify a change**, re-drive the same path after
the change, and for structural changes also run the automated checks in
[TESTING.md](TESTING.md).
