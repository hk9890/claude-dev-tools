# taskmgr is not on PATH

`tasks-core` prints the tracker's own guide. When the binary is absent the skill prints a `STOP`
line instead, and every other skill in this plugin is blocked behind it: they have no command
surface to work from, and a body written without the store's standard is refused by its gate.

Tell the user what is missing, offer the install below, and file nothing until `taskmgr guide`
prints.

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

## It is installed but the guide is thin

`taskmgr guide` lists the built-in jobs and every topic a package contributes. A store whose
conventions are missing has no package installed for them; `taskmgr package list` shows what is
loaded. Report that and let the user decide whether to install one — do not work around it.

## Every other failure

taskmgr reports its own error states and the message carries the fix: a directory with no store
names `taskmgr init`, and a refused write names the section or the hook that refused it. Act on
what the command printed rather than guessing from here.
