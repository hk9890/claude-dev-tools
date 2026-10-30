# Prompting another agent

1. Run `revier agent --help`. It is the authority for the `<agent>` address, the statuses, the `<key>` names, and what `prompt` refuses.
2. Find the agent with `revier list --json <project>`.
   - No agent, and no `.home`: `revier open <name>` opens or raises the workspace and takes the focus, so give the command to the user.
   - No agent, and `.home` is set: add one, and use the address the command prints as `<agent>`:

     ```bash
     revier agent new --no-focus -p <name>
     ```

     The focus stays where it is. On kitty, a workspace window that does not hold the keyboard shows the new tab, so tell the user that the project has a new agent tab. The address names an agent once the harness in the tab has started: run `revier agent wait <agent> --until idle --timeout 30`. It ends in one of three ways:
     - It prints `idle`: go to step 4.
     - It exits 2 on the timeout: the agent is there and is not idle, so run `revier list --json <name>` again and continue with step 3.
     - It fails with another error: the harness has not started, so run the `wait` again. After one minute of that error, report the message of revier to the user and stop here.
   - An agent with no `.ref`: report that it runs on the other machine, out of reach from here.
   - An agent with no `.target`: report that revier cannot reach it.
   - Several agents: pick by `.state.activity`, and use its address as `<agent>`. Ask the user when the activity does not decide it.
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

   revier refuses with "the agent's last message cannot be read" for the agent of a link, for a harness other than Claude Code, and for an agent that has said nothing. Then read its panel:

   ```bash
   revier agent read <agent> --screen --lines <n>
   ```

   The screen is the text of the panel, with the composer and the status line of the harness in it. Raise `--lines` until the output holds the start of the answer.

## An agent at attention

An agent at `attention` shows a dialog, often a permission question, so the answer belongs to its user. Report the agent and its status to the user, send no key, and stop here: steps 4 to 6 need an agent that is past its dialog.

Answer the dialog yourself only where the user asked for that in this session. Then these steps take the place of the report:

1. Read the dialog with `revier agent read <agent> --screen --lines <n>`.
2. Send the keys for the answer the user asked for. A key lands on whatever the panel shows, so send only keys that the screen from step 1 offers:

   ```bash
   revier agent send-keys <agent> <key>..
   ```

3. Read the screen again. The dialog is answered when the screen shows it no more: go back to the step that sent you here, and wait for the turn. Where the screen still shows a dialog, send no further key: report the text of the dialog to the user and stop here.
