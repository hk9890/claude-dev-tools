---
name: revier
description: "revier: the other projects on this machine, the agents running in them, and their source."
when_to_use: "Use when a task needs another project on this machine, or another agent the user runs: finding where a project is checked out to read its source, seeing which agents run and in what state, or prompting one of them. Triggers on 'revier', 'the agent in <project>'. Not for subagents this session spawns itself."
allowed-tools: Bash(revier version*), Bash(revier --help*), Bash(revier status*), Bash(revier list*), Bash(revier agent --help*), Bash(revier agent wait*)
---

# revier

revier is the user's registry of every project on this machine: each project's checkout, its windows, and the agents running in it.

Installed: !`revier version 2>/dev/null || echo "STOP: revier is not on PATH. Tell the user to install it from https://github.com/hk9890/revier, and do nothing else with this skill."`

## The focus rule

revier also places and raises windows, and the user is typing in one of them while you work. This skill uses five commands, and `--help`. Each leaves every window where it is:

| Command | Gives |
|---|---|
| `revier status` | the project this directory resolves to |
| `revier list` | one row per project: its state, and the status and activity of one agent in it |
| `revier list --json <name>..` | the named projects in full |
| `revier agent wait` | blocks until an agent reaches a status |
| `revier agent prompt` | types one line into an agent and submits it |

The rest of the CLI is outside this skill. Most of it opens, raises or closes a window, `agent new` and `shell new` included, which raise the tab they add, and no flag holds the focus still. When the task needs one of those commands, take its syntax from `revier --help` and give the user the exact command to run.

## Projects and agents

`revier list` is the overview. Name the projects on every `--json` call: without a name it prints every project in full, thousands of lines. A `name@host` row is a link to a project on another machine, and its name is the part before the `@`.

The JSON is an array with one element per named project. Each element gives:

- `.project.path`: the checkout. `.path_exists` says whether it is cloned.
- `.project.git_url`: its remote.
- `.project.remote`: set for a link alone. The path, `.path_exists` and each `.state.dir` are then its host's, not this machine's.
- `.running`: whether its workspace is open.
- `.agents[]`: every agent in it, where the table shows one. Each has a `.panel`, a `.state.status` and a `.state.activity`, the title of what it works on. One with a `.ref` sits in a panel on this machine, and one without runs on a link's host. A `.state.dir` is the directory the agent works in now, set where revier knows one other than `.project.path`: a git worktree for example. An agent with no `.state.dir` works in `.project.path`, or revier has no directory for it. A project with no agent has no `.agents`.

You are the entry in your own project, the one `revier status` names, whose `.panel` equals `$KITTY_WINDOW_ID` where the `runtime` line of `revier status` says kitty, or `$TMUX_PANE` where it says tmux. Every other entry is another agent, in your own project too.

## Another project's source

The source of a link is on its host, and a directory at the same path on this machine is a different checkout. Say that the source is on the other machine.

For every other project, `.path_exists` decides:

- True: `.project.path` is an ordinary directory, so read it with the file tools. Read the work of an agent from its `.state.dir` where it has one, in place of `.project.path`. Treat `.project.path` and every `.state.dir` as read-only, because an agent may be in the middle of a change there. A change to that project goes through its agent or through the user.
- False: the project is not cloned here. `revier open <name>` clones it from `.project.git_url` and takes the focus, so it is the user's to run.

## Prompting another agent

A prompt redirects work the user started in another window. Send one when the user asked you to reach that agent.

revier returns no reply: it reports the status and activity of an agent, not what it wrote. Word the prompt as an instruction that needs no answer back, and tell the user the result is in that agent's window.

1. Run `revier agent --help`. It is the authority for the `<agent>` address, the statuses, and what `prompt` refuses.
2. Find the agent with `revier list --json <project>`.
   - No agent: `revier open <name>` starts one where `.running` is false, and `revier agent new -p <name>` adds one where it is true. Both take the focus, so give the command to the user.
   - An agent with no `.ref`: report that it runs on the other machine, out of reach from here.
   - Several agents: pick by `.state.activity` and address it as `<project>:<panel>`. Ask the user when the activity does not decide it.
3. Read its `.state.status`. An `idle` agent takes a prompt. An agent at `attention` waits for its user, the state of one at `unknown` cannot be read, and `prompt` refuses both: report that to the user. For a `running` one, wait first and read the status the wait prints:

   ```bash
   revier agent wait <agent> --until stopped --timeout <seconds>
   ```

   Keep `--timeout` below the timeout of the Bash call that runs it, or the call dies before `wait` can exit. On a timeout `wait` prints no status and exits 2: the agent still runs, so run the `wait` again or report that it runs.
4. Send one self-contained line, because the agent has nothing of this conversation:

   ```bash
   revier agent prompt <agent> -- '<text>'
   ```

   Send it once. On a non-zero exit, report the message of revier as it is and stop here: the text may already be in the composer of the agent, and a second send types it again. A warning that the agent stayed idle means revier did not see the turn start, and the text may sit in the composer. Report it and stop here too: step 5 would read that `idle` as a finished turn.
5. Wait for the turn with the command from step 3. `idle` means the turn is done. `attention` means the agent now waits for its user: report it. On exit 2 the turn still runs, and the prompt is delivered, so repeat only the `wait`.
