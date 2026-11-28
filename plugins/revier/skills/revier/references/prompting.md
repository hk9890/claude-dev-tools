# Prompting another agent

1. Run `revier agent --help`. It is the authority for the `<agent>` address, the statuses, and what `prompt` refuses.
2. Find the agent with `revier list --json <name>`, where `<name>` is the project's name.
   - No `.home`, and there is no agent or the user asked for a new one: `revier open <name>` opens or raises the workspace and takes the focus, so give the command to the user and stop here.
   - `.home` is set, and there is no agent or the user asked for a new one: add one, and use the address the command prints as `<agent>`:

     ```bash
     revier agent new --no-focus -p <name>
     ```

     The focus stays where it is. On kitty, a workspace window that does not hold the keyboard shows the new tab, so tell the user that the project has a new agent tab. The address names an agent once the harness in the tab has started: run `revier agent wait <agent> --until idle --timeout 30`. It ends in one of three ways:
     - It prints `idle`: go to step 4.
     - It exits 2 on the timeout: the agent is there and is not idle, so run `revier list --json <name>` again and continue with step 3.
     - It fails with another error: the harness has not started, so run the `wait` again. After one minute of that error, report the message of revier to the user and stop here.
   - The agent the user means has no `.target`, or agents are listed but none has one: report that revier cannot reach it from here, and stop here.
   - Several agents with a `.target`: pick by `.state.activity`, and use its address as `<agent>`. Ask the user when the activity does not decide it.
3. Read its `.state.status`. An `idle` agent takes a prompt. `prompt` refuses an agent at `attention` and one at `unknown`. For `attention`, follow "An agent at attention". The state of one at `unknown` cannot be read: report that to the user. For a `running` one, wait first and read the status the wait prints:

   ```bash
   revier agent wait <agent> --until stopped --timeout <seconds>
   ```

   Keep `--timeout` below the timeout of the Bash call that runs it, or the call dies before `wait` can exit. On a timeout `wait` prints no status and exits 2: the agent still runs, so run the `wait` again or report that it runs.
4. Send one self-contained line, because the agent has nothing of this conversation:

   ```bash
   revier agent prompt <agent> -- '<text>'
   ```

   Send it once. On a non-zero exit, report the message of revier as it is and stop here: the text may already be in the composer of the agent, and a second send types it again. A warning that the agent stayed idle means revier did not see the turn start, and the text may sit in the composer. Report it and stop here too: step 5 would read that `idle` as a finished turn.
5. Where the user hands the work to the agent and asks for no answer back, report the address of the agent and stop here: it goes on alone. Else wait for the turn with the command from step 3. `idle` means the turn is done. `attention` means the agent now waits for its user: follow "An agent at attention". On exit 2 the turn still runs, and the prompt is delivered, so repeat only the `wait`.
6. Read the answer of the agent, and give it to the user:

   ```bash
   revier agent read <agent>
   ```

   revier refuses with "the agent's last message cannot be read" for the agent of a link, for a harness other than Claude Code, and for an agent that has said nothing. Then read its panel, and for the agent of a link or of another harness read it at once:

   ```bash
   revier agent read <agent> --screen --lines <n>
   ```

   The screen is the text of the panel, with the composer and the status line of the harness in it. Raise `--lines` until the output holds the start of the answer.

## An agent at attention

An agent at `attention` shows a dialog, often a permission question, so the answer belongs to its user. Report the agent and its status to the user, and stop here: steps 4 to 6 need an agent that is past its dialog.

## Resume a session

To bring back a Claude Code conversation in a new agent tab, as a `kind:park` task asks, take its session `<id>`, its `<project>`, and its start `<dir>` where it names one. `find`, `test`, `jq` and `claude agents` are outside the tools this skill runs without a prompt, so steps 1 to 3 ask the user for permission.

0. Where `<id>` equals `$CLAUDE_CODE_SESSION_ID`, the conversation is this one and it already runs: report that and stop here.
1. The transcript: `find ~/.claude/projects -maxdepth 2 -name '<id>.jsonl'`. Where it prints nothing, the result is "conversation gone": report it and stop here.
2. The directory, where `<dir>` is given: `test -d <dir>`. Where it fails, the result is "directory gone": report it and stop here.
3. The conversation is not live. A live conversation resumed a second time runs twice, so each check must print `false`:

   ```bash
   revier list --json | jq --arg id <id> 'any(.[].agents[]?; .state.session == $id)'
   claude agents --json | jq --arg id <id> 'any(.[]; .sessionId == $id)'
   ```

   Run `claude agents --json` as it is: `--all` adds sessions that are done. Where one prints `true`, report which agent holds it and stop here.
4. `revier list --json <project>` has `.home`. Where it has none, give the user `revier open <project>` and stop here.
5. Resume it, with `--no-focus` directly after `agent new`, and keep stdout, the `<agent>` address, apart from stderr:

   ```bash
   revier agent new --no-focus -p <project> --resume <id> [--dir <dir>]
   ```

6. A stderr line with "was not resumed" or "has written no transcript" is a failed resume, also with exit 0: the tab holds an empty agent. Report the line, and tell the user to close that tab: a hook of this plugin refuses `agent close`.
7. Confirm the conversation: `revier agent wait <agent> --until idle --timeout 30 --json`. Where it fails because the harness has not started, run it again for up to one minute. The resume holds when its `.session` equals `<id>`. Where it names another session, report both ids and the address.
