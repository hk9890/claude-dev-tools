---
name: inspect
description: "This skill should be used when the user wants to inspect, diagnose, or analyze the keep-awake-linux plugin. Triggers on questions like 'what is keep-awake doing', 'show me keep-awake state', 'analyze the keep-awake log', 'is keep-awake working', 'why didn't keep-awake fire', 'is keep-awake holding an inhibitor', 'show recent keep-awake activity', 'inspect keep-awake', 'keep-awake-linux status', 'are there orphaned keep-awake inhibitors'. Does not apply to installing, uninstalling, or modifying the plugin itself, and does not apply to general 'why is my machine staying awake' questions that are not about this plugin."
---

## What this skill does

Produce a structured report of the keep-awake-linux plugin's **current state** and **recent activity**, by reading raw state files and the log directly. Does NOT depend on the `keep-awake` binary being on `$PATH`.

Use the existing plugin data; do NOT spawn new inhibitors, kill existing ones, or modify state files unless the user explicitly asks.

## Hard rule

NEVER run any of these during inspection:

```
systemctl suspend
systemctl hibernate
systemctl poweroff
systemctl reboot
loginctl suspend
loginctl hibernate
```

The plugin's contract is "register an inhibitor with logind". Triggering an actual suspend is out of scope for inspection.

## Workflow

### Step 1 — Resolve the state directory

Try, in order:

```bash
STATE_DIR=""
if [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -d "$XDG_RUNTIME_DIR/claude-keep-awake" ]; then
  STATE_DIR="$XDG_RUNTIME_DIR/claude-keep-awake"
elif [ -d "/tmp/claude-keep-awake-$(id -u)" ]; then
  STATE_DIR="/tmp/claude-keep-awake-$(id -u)"
fi
```

If `$STATE_DIR` ends up empty, the plugin has never run on this system (or state was wiped). Report this fact and stop — current state is "no state".

### Step 2 — Current state

```bash
ls -la "$STATE_DIR/sessions/" 2>/dev/null
# Capture full listing; the format differs across systemd versions
systemd-inhibit --list 2>&1 | head -200
```

If `systemd-inhibit` itself is missing (command not found), note that as an environmental issue and skip the cross-check — rely on PID markers alone.

In the captured listing, identify entries by their `--why "Claude session <sid>"` text OR by `claude-keep-awake` appearing in the command. Don't rely on the "Who" column — older systemd versions show the user, not the command.

For each `<session_id>.pid` marker:

- Read its PID.
- Check `/proc/<pid>/comm` is `systemd-inhibit` and `/proc/<pid>/cmdline` contains `claude-keep-awake`. Classify as **alive** (both checks pass), **dead** (process gone), or **stale-marker-other-process** (PID exists but isn't our inhibitor).
- Note when the marker file was last modified.

Then cross-check with logind: every alive marker should correspond to one `systemd-inhibit --list` entry whose Why field contains `Claude session <sid>`. Flag any mismatch.

### Step 3 — Read recent activity

```bash
LOG="$STATE_DIR/keep-awake.log"
LOG_ROT="$STATE_DIR/keep-awake.log.1"
```

Read the last ~200 lines from `$LOG` (use `tail -200`). If `$LOG` is short and `$LOG_ROT` exists, also read the tail of `$LOG_ROT` for additional context.

If `$LOG` is missing, but current state shows active sessions: the user probably has `KEEP_AWAKE_LOG=0` set, or the log was rotated/deleted. Note this and continue.

Log line format:

```
<ISO timestamp> hook=<EventName|->  sid=<truncated_sid|-> verb=<verb|-> outcome=<outcome> [new_pid=<n>] [old_pid=<n|->] [pid=<n>]
```

When invoked via the `hook` verb, two correlated lines appear together: one with `hook=<Event>` (dispatch) and one with `verb=start|stop` (underlying action).

### Step 4 — Per-session timeline

Each hook fire produces TWO log lines: a `hook=<Event> verb=-` dispatch line and a paired `hook=- verb=<start|stop>` action line. **Count events by the `verb=start|stop` lines only** (the action lines); the `hook=...` dispatch lines are correlation aids, not separate events. Counting both will double-report.

Group action lines by `sid=` and within each group give a one-line summary like:

```
sid=abc12345  3 starts (1 spawned, 2 refreshed), 1 stop (killed). Last event 2 min ago.
```

Mark a session as **likely-stranded** when ALL of:
- no `verb=stop` action line ever appears for it, AND
- the most recent event is older than `KEEP_AWAKE_TTL` seconds (default 1800), AND
- no live marker remains in `sessions/` (per Step 2).

A long-idle session with a still-alive inhibitor is normal — don't flag it.

### Step 5 — Anomaly detection

Flag any of these:

| Pattern | Likely cause |
|---|---|
| Marker exists but inhibitor PID is dead | Inhibitor crashed or TTL expired; next `start` should GC it |
| `systemd-inhibit --list` shows entry with no matching marker | Helper was invoked by a different STATE_DIR (e.g. different user, different runtime) — or a previous helper-version orphan |
| Repeated `no-op-systemd-inhibit-missing` | `systemd-inhibit` not on PATH where hooks run; check `$PATH` in hook environment |
| Repeated `no-op-jq-missing` | `jq` not installed; install with `apt install jq` / `dnf install jq` |
| Repeated `no-op-missing-sid` | Hook stdin not delivering `session_id` — possible Claude Code version mismatch |
| `no-op-invalid-sid` | Something injected a malformed `session_id`; report the value (truncated in log) |
| Many refreshes per minute (>20) for one session | Normal during agentic tool-use loops; not necessarily a problem, but worth noting |
| Active session in current state but ZERO events in log | Logging disabled (`KEEP_AWAKE_LOG=0`), log file was deleted/rotated, or the hooks fired before logging was added (v0.1.0 → v0.1.1) |
| `skipped-pid-not-ours` events | Marker file pointed at a PID we don't own (kernel PID reuse or external interference); helper correctly refused to SIGTERM |

### Step 6 — Output

Use this structure. Omit sections that have nothing to report.

```
## Keep-awake — state report

**State directory:** /run/user/1000/claude-keep-awake
**Logging:** enabled (or "disabled" if KEEP_AWAKE_LOG=0 detected)

### Current state

| Session ID (truncated) | Marker PID | Inhibitor status | Logind entry |
|---|---|---|---|
| abc12345 | 981437     | alive            | yes          |
| def67890 | 982001     | alive            | yes          |

Total: 2 active sessions, 2 logind inhibitors.

### Recent activity (last <N> events from log)

- sid=abc12345 — 5 starts (1 spawned, 4 refreshed), 0 stops. Last event 14s ago.
- sid=def67890 — 2 starts (1 spawned, 1 refreshed), 0 stops. Last event 1m 12s ago.

### Anomalies

- (or "None detected.")

### Suggestions

- (only if anomalies found or user asked for help)
```

If the user asked a focused question ("why didn't the hook fire after I submitted a prompt"), tailor the report to that — lead with the relevant log evidence (or its absence) and the most likely cause.

## When the report is empty

If state dir is empty AND log is empty AND no inhibitors are registered with logind: the plugin is correctly in its **idle** state. Report this in one sentence; don't pad.

If state dir is empty AND log is empty BUT inhibitors with `claude-keep-awake` are registered with logind: these are orphans from a prior helper version or a state-dir mismatch. Report them with their PIDs and `--why` annotations so the user can decide whether to `pkill -f 'systemd-inhibit.*claude-keep-awake'`.

## What not to do

- Do NOT modify any file in the state directory. Reading only.
- Do NOT call `keep-awake start|stop|hook` during inspection — that would alter state.
- Do NOT spawn or kill any process unless the user explicitly asks for cleanup, in which case confirm first.
- Do NOT extrapolate beyond what the log shows. If the log is silent, say it's silent — don't invent activity.
