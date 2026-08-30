# taskmgr is unavailable

Every skill in this plugin works from what `taskmgr guide` prints. Without it there is no command
surface, and a body written without the store's standard is refused by its gate.

Tell the user what is missing, offer the install below, and resume once `taskmgr guide` prints.

## Install it

`taskmgr` is a single Go binary, published from
[hk9890/task-manager](https://github.com/hk9890/task-manager). It is not in mise's registry, so the
GitHub backend is named in full:

```bash
mise use -g "github:hk9890/task-manager@latest"
go install github.com/hk9890/task-manager/cmd/taskmgr@latest   # ...or with Go directly
```

Confirm with `taskmgr version`.

Then **load this skill again**. Its guide line runs only when the skill loads, so a copy loaded
before the install keeps showing the `STOP` line however many commands you run afterwards.

## The guide printed, but the store's conventions are missing

`taskmgr guide` lists the built-in jobs and every topic a package contributes. A store missing its
conventions has no package installed for them, and `taskmgr package list` shows what is loaded.
Report that and let the user decide whether to install one.

## Every other failure

taskmgr reports its own error states and the message carries the fix: a directory with no store
names `taskmgr init`, and a refused write names the section or the hook that refused it. Act on
what the command printed.
