---
name: revier
description: "revier: other projects on this machine, their agents, and their source."
when_to_use: "Use when a task needs another project or another agent the user runs: its checkout, its agents and their state, prompting one, or the projects worked in lately. Triggers on 'revier', 'the agent in <project>', 'other Claude instances in this project', 'the projects I worked on'. Not for subagents this session spawns. ListAgents shows every session, not which agents work in a project."
allowed-tools: Bash(revier version*), Bash(revier --help*), Bash(revier status*), Bash(revier list*), Bash(revier events*), Bash(revier agent --help*), Bash(revier agent wait*), Bash(revier agent read*), Bash(revier agent new --no-focus*)
---

# revier

revier is the user's registry of every project on this machine: each project's checkout, its windows, and the agents running in it.

Installed: !`revier version 2>/dev/null || echo "STOP: revier is not on PATH. Tell the user to install it from https://github.com/hk9890/revier, and do nothing else with this skill."`

## The focus rule

revier also places and raises windows, and the user is typing in one of them while you work. This skill uses the commands below, and `--help`. Each leaves every window where it is:

| Command | Gives |
|---|---|
| `revier status` | the project this directory resolves to |
| `revier list` | one row per project: its state, and the status and activity of one agent in it |
| `revier list --json <name>..` | the named projects in full |
| `revier events` | one JSON line per thing revier did in a project in the last days |
| `revier agent wait` | blocks until an agent reaches a status |
| `revier agent prompt` | types one line into an agent and submits it |
| `revier agent read` | prints the last message of an agent, or with `--screen` the text of its panel |
| `revier agent send-keys` | types named keys into an agent, whatever its status |
| `revier agent new --no-focus` | adds an agent tab to the open home window and prints the address of the agent |

This skill needs revier 0.14.0 or later: where the "Installed" line above shows an older one, tell the user to update revier, and do nothing else with this skill.

The rest of the CLI is outside this skill. Most of it opens, raises or closes a window: `shell new` raises the tab it adds, and so does `agent new` without `--no-focus`. When the task needs one of those commands, take its syntax from `revier --help` and give the user the exact command to run.

## Projects and agents

`revier list` is the overview. Name the projects on every `--json` call: without a name it prints every project in full, thousands of lines. A `name@host` row is a link to a project on another machine, and its name is the part before the `@`.

The JSON is an array with one element per named project. Each element gives:

- `.project.path`: the checkout. `.path_exists` says whether it is cloned.
- `.project.git_url`: its remote.
- `.project.remote`: set for a link alone. The path, `.path_exists` and each `.state.dir` are then its host's, not this machine's.
- `.running`: whether a window of its workspace is open. For information only: step 2 of `<base directory for this skill>/references/prompting.md` decides on `.home`.
- `.home`: the home window, where `agent new` adds its tab. A project whose home window is not open has no `.home`.
- `.agents[]`: every agent in it, where the table shows one. A project with no agent has no `.agents`. Each agent gives:
  - `.panel` and `.state.status`.
  - `.state.activity`: the title of what it works on, set where it has one.
  - `.ref`: set for an agent in a panel on this machine. One without it runs on a link's host.
  - `.state.dir`: the directory the agent works in now, set where revier knows one other than `.project.path`: a git worktree for example. An agent without it works in `.project.path`, or revier has no directory for it.

Your own entry is in the project that `revier status` names. Its `.panel` equals `$KITTY_WINDOW_ID` where the `runtime` line of `revier status` says kitty, or `$TMUX_PANE` where it says tmux. Every other entry is another agent, in your own project too.

## Another project's source

The source of a link is on its host, and a directory at the same path on this machine is a different checkout. Say that the source is on the other machine.

For every other project, `.path_exists` decides:

- True: `.project.path` is an ordinary directory, so read it with the file tools. Read the work of an agent from its `.state.dir` where it has one, and from `.project.path` where it has none. Treat `.project.path` and every `.state.dir` as read-only, because an agent may be in the middle of a change there. A change to that project goes through its agent or through the user.
- False: the project is not cloned here. `revier open <name>` clones it from `.project.git_url` and takes the focus, so it is the user's to run.

## Past use

For a question about the last days, such as which projects the user worked in, read `<base directory for this skill>/references/past-use.md` and run its script rather than `revier events`.

## Prompting another agent

Before your first `revier agent` command of any kind (`wait`, `read`, `prompt`, `send-keys` or `new`), read `<base directory for this skill>/references/prompting.md`. Follow all of it to prompt an agent. To add an agent without a prompt, stop after the `wait` of step 2. For any other command, use steps 1 and 2 only to find the agent, add none and send no prompt, then follow the steps of the commands you run. A prompt redirects work the user started in another window: send one only when the user asked you to reach that agent.
