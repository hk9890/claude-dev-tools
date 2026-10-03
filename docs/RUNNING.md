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
- **Mods** — `keep-awake-linux`, `worktree-flow` and `tasks` ship one (`plugins/<plugin>/hooks/register.ts*`). Load the one plugin with `claude -p "<prompt>" --plugin-dir plugins/<plugin> --debug-file <file>`; the debug file has a `hooks module <plugin>@inline loaded` line and a line for every hook the engine skipped. Confirm `keep-awake-linux` with its `keep-awake-inspect` skill, `tasks` with `claude -p "/tasks-board" --plugin-dir plugins/tasks`, and the `worktree-flow` guard by asking for `git worktree add ../x` and reading the refusal. A pane or a status line shows in an interactive terminal alone: start one in tmux (`tmux new-session -d -s mod -x 180 -y 50 "claude --plugin-dir plugins/<plugin>"`), type with `tmux send-keys -t mod "/tasks-board" Enter`, and read the screen with `tmux capture-pane -t mod -p`.

To **reproduce a reported bug**, drive the exact path from the report; where it came from a real session, the transcripts in [MONITORING.md](MONITORING.md) help recover the input that triggered it. To **verify a change**, re-drive that path afterwards, and for structural changes also run the checks in [TESTING.md](TESTING.md).
