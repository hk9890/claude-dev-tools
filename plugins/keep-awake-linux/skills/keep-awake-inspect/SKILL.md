---
name: keep-awake-inspect
description: "Inspect and diagnose the keep-awake-linux plugin: the inhibitors logind holds and which session owns each."
user-invocable: true
disable-model-invocation: true
---

# Keep-awake inspection

Report which sleep inhibitors the keep-awake-linux mod holds now, and explain any that should not
be there or are missing. The inspection is read-only: observe, never start or kill an inhibitor,
unless the user asks for cleanup, and confirm first when they do.

The plugin's contract is "hold an inhibitor with logind". Triggering a real suspend is outside
the inspection: leave `systemctl suspend|hibernate|poweroff|reboot` and `loginctl
suspend|hibernate` alone.

## How the mod behaves

- Activity is a turn start, a turn end, or a tool call, from the main session or an agent. Activity
  with no inhibitor held starts one `systemd-inhibit --what=idle:sleep --who=claude-keep-awake
  --why="Claude session <session id>" --mode=block sleep 1800`. One second later the status line
  shows `keep-awake-linux: sleep blocked`.
- The child is respawned when its `sleep 1800` ends while the session still wants it, so the PID
  changes every 30 minutes and the inhibitor stays.
- The inhibitor ends `idleMinutes` after the last activity, even while a turn is open: a session
  that waits at a permission prompt releases the machine. `idleMinutes` is a plugin option,
  default 30, minimum 1; a lower value stops the mod from loading.
- It ends at once on session exit, on `/clear`, and when the mod reloads.
- A child that fails in its first second (no `systemd-inhibit`, logind refuses) turns the mod off
  until it reloads or Claude Code restarts: one toast `sleep is not blocked: <reason>`, and no
  further attempt. A `/clear` does not turn it on again.
- A child that fails later writes `inhibitor lost: <reason>` to the debug log, with no toast, and
  the next activity starts a new one.
- The inspection is activity too: where the mod works, this session holds an inhibitor while the
  steps run.
- There is no state directory and no log file. The only records are logind's list and the debug
  log (`claude --debug`), where the mod's lines carry the plugin's name.

## Steps

1. List what logind holds and who started each entry, in one shell call:

   ```bash
   echo "this session: ${CLAUDE_CODE_SESSION_ID:-unknown}"
   command -v systemd-inhibit >/dev/null 2>&1 || echo "systemd-inhibit MISSING"
   systemd-inhibit --list 2>&1 | grep -E 'WHO|claude-keep-awake'
   for pid in $(pgrep -f '^systemd-inhibit .*--who=claude-keep-awake'); do
     ppid=$(ps -o ppid= -p "$pid" | tr -d ' ')
     [ -n "$ppid" ] || continue   # the inhibitor ended between the two calls
     printf '%s parent=%s (%s) age=%s\n' "$pid" "$ppid" "$(ps -o comm= -p "$ppid")" "$(ps -o etime= -p "$pid" | tr -d ' ')"
   done
   ```

   Done when every `claude-keep-awake` entry has a session id (from its Why field), a PID, a
   parent process and an age.

2. Classify every entry against the table. Done when each entry has exactly one row, and this
   session's entry is found or reported as missing. A missing one is an anomaly: step 3 names its
   cause.

   | Finding | Meaning |
   |---|---|
   | Parent is a `claude` process, age under 30 min | Healthy: the session is working or inside its idle window |
   | Parent is PID 1 or not `claude` | Orphan: Claude Code was killed, or the entry is from the shell version of the plugin, which detached its inhibitors. It lapses when its `sleep 1800` ends |
   | Two entries with the same session id, both with a `claude` parent | Defect in the mod; report both PIDs |

3. When this session has no entry, or the user expected one for another session and none is
   listed, name the cause. Done when one row matches or all are ruled out.

   | Check | Cause |
   |---|---|
   | `systemd-inhibit MISSING` in step 1 | Not a systemd machine, or not on PATH: the child failed in its first second |
   | The user saw the toast `sleep is not blocked` and `systemd-inhibit` is present | logind refused the request in the child's first second; the toast and the `inhibitor lost` line in the debug log carry the reason |
   | `claude --version` below 2.1.287 | Mods are not supported; the plugin does nothing |
   | `disableAllHooks` is true in a user, project, local or managed settings file, or the session started with `--safe-mode` or `--bare` | Mods are off |
   | `/plugin` shows no `mod active` line that names `keep-awake-linux` | The plugin is disabled or blocked by managed settings, or `idleMinutes` is below 1; ask the user to look, the command is theirs to run |
   | Another session: no turn ran yet, or its last activity is more than `idleMinutes` ago | Correct idle state |

## Report

```
## Keep-awake — state report

| Session | PID | Parent | Age | Verdict |
|---|---|---|---|---|
| 27ddbffb | 2414773 | claude (2414001) | 12:40 | healthy |

### Anomalies
- (or "None detected.")
```

Report what logind and the process table show, and stop there.
