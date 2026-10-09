---
name: revier
description: "revier: the other projects on this machine, the agents running in them, and their source."
when_to_use: "Use when a task needs another project on this machine, or another agent the user runs: finding where a project is checked out to read its source, seeing which agents run and in what state, prompting one of them, or finding which projects the user worked in over the last days. Triggers on 'revier', 'the agent in <project>', 'the projects I worked on'. Not for subagents this session spawns itself."
allowed-tools: Bash(revier version*), Bash(revier --help*), Bash(revier status*), Bash(revier list*), Bash(revier events*), Bash(revier agent --help*), Bash(revier agent wait*)
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

The rest of the CLI is outside this skill. Most of it opens, raises or closes a window, `agent new` and `shell new` included, which raise the tab they add, and no flag holds the focus still. When the task needs one of those commands, take its syntax from `revier --help` and give the user the exact command to run.

## Projects and agents

`revier list` is the overview. Name the projects on every `--json` call: without a name it prints every project in full, thousands of lines. A `name@host` row is a link to a project on another machine, and its name is the part before the `@`.

The JSON is an array with one element per named project. Each element gives:

- `.project.path`: the checkout. `.path_exists` says whether it is cloned.
- `.project.git_url`: its remote.
- `.project.remote`: set for a link alone. The path, `.path_exists` and each `.state.dir` are then its host's, not this machine's.
- `.running`: whether its workspace is open.
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

`revier list` shows what is open now. For a question about the last days, such as which projects the user worked in, run the script of this skill. Its arguments are those of `revier events`:

```bash
command -v python3 >/dev/null || { echo "STOP: python3 is not on PATH. Tell the user, and read revier events --help instead."; exit 1; }
python3 "<base directory for this skill>/scripts/past-use.py" --days <n>
```

It prints one JSON line per project, most used first: the project with more `.days`, then the one with more `go` presses. Each line gives:

- `.project`, and `.host` for a project on a linked host. A link and the project it points to are one line, under the name of the link, with `.host_project` for its name on that host.
- `.days`: the days, on the clock of this machine, on which revier did something there. A project with `.sessions[]` and no `.days` had an agent open that revier was not asked to show: report it apart, as open and not as worked in.
- `.last`: the time of the newest event.
- `.events`: a count per kind, except `agent session`, which `.sessions[]` carries. `revier events --help` says what each kind records.
- `.sessions[]`: each conversation an agent held there, with its `.agent`, `.session` and `.dir`.

A warning on stderr names a linked host that gave no events: report that its projects are missing from the answer.

To act on the projects, for example to list the pull requests the user opened in them, take each checkout from `revier list --json <name>..` and run `git` or `gh` there under the rules of "Another project's source". A line with `.host` and no `.host_project` is a project of that host with no link here, so it has no checkout here: report it by name and host.

A conversation of a Claude agent on this machine is the one transcript that `~/.claude/projects/*/<session>.jsonl` matches. The format of a transcript is internal to Claude Code and can change. A conversation on a line with `.host` is on that host, out of reach from here.

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
