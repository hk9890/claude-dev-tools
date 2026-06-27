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

Inside that session:

- **Skills** — invoke a skill by *describing its use case* (not by name) and confirm it
  triggers; then check the output.
- **Commands** — run the slash command and check its output.
- **Hooks** — perform the action that should fire the hook and confirm it fires.

## Reproduce a reported bug

1. Launch with `./scripts/claude-dev`.
2. Drive the exact path from the report (the skill use case, the command, or the hook
   action) and observe the behavior.
3. If the report came from a real session, the transcript and usage signals described in
   [MONITORING.md](MONITORING.md) can help recover the input that triggered it.

## Verify a change

Re-drive the same path after the change: confirm a skill still triggers and its output is
correct, a command produces the expected result, or a hook fires. For structural changes,
also run the automated checks in [TESTING.md](TESTING.md).
