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

- The first main turn of a session starts one `systemd-inhibit --what=idle:sleep
  --who=claude-keep-awake --why="Claude session <session id>" --mode=block sleep 1800`, and the
  status line shows `keep-awake: on`.
- The child is respawned when its `sleep 1800` ends while the session still wants it, so the PID
  changes every 30 minutes and the inhibitor stays.
- The inhibitor ends `idleMinutes` (plugin option, default 30) after the last main turn completes.
  A tool call inside that window, from a background agent, extends it by one more period.
- It ends at once on session exit, on `/clear`, and when the mod reloads.
- There is no state directory and no log file. The only records are logind's list and the debug
  log (`claude --debug`), where the mod's lines start with `keep-awake-linux:`.

## Steps

1. List what logind holds and who started each entry, in one shell call:

   ```bash
   command -v systemd-inhibit >/dev/null 2>&1 || echo "systemd-inhibit MISSING"
   systemd-inhibit --list 2>&1 | grep -E 'WHO|claude-keep-awake'
   for pid in $(pgrep -f 'systemd-inhibit.*--who=claude-keep-awake'); do
     ppid=$(ps -o ppid= -p "$pid" | tr -d ' ')
     printf '%s parent=%s (%s) age=%s\n' "$pid" "$ppid" "$(ps -o comm= -p "$ppid")" "$(ps -o etime= -p "$pid" | tr -d ' ')"
   done
   ```

   Done when every `claude-keep-awake` entry has a session id (from its Why field), a PID, a
   parent process and an age.

2. Classify every entry against the table. Done when each entry has exactly one row.

   | Finding | Meaning |
   |---|---|
   | Parent is a `claude` process, age under 30 min | Healthy: the session is working or inside its idle window |
   | Parent is PID 1 or not `claude` | Orphan: Claude Code was killed, or the entry is from the shell version of the plugin, which detached its inhibitors. It lapses when its `sleep 1800` ends |
   | Two entries with the same session id, both with a `claude` parent | Defect in the mod; report both PIDs |

3. When the user expected an inhibitor and none is listed, name the cause. Done when one row
   matches or all are ruled out.

   | Check | Cause |
   |---|---|
   | `systemd-inhibit MISSING` in step 1 | Not a systemd machine, or not on PATH: the mod is a no-op and logs `inhibitor lost` to the debug log |
   | `claude --version` below 2.1.287 | Mods are not supported; the plugin does nothing |
   | `disableAllHooks` is true in `~/.claude/settings.json`, or the session started with `--safe-mode` or `--bare` | Mods are off |
   | `/plugin` → Installed does not name `keep-awake-linux` under the mods-active line | The plugin is disabled or blocked by managed settings; ask the user to look, the command is theirs to run |
   | No main turn ran yet, or the last one ended more than `idleMinutes` ago | Correct idle state |

## Report

```
## Keep-awake — state report

| Session | PID | Parent | Age | Verdict |
|---|---|---|---|---|
| 27ddbffb | 2414773 | claude (2414001) | 12:40 | healthy |

### Anomalies
- (or "None detected.")
```

Report what logind and the process table show, and stop there. No entries, no anomalies and no
expectation of one is the plugin's idle state: say so in one sentence.
