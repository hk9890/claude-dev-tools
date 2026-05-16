# keep-awake-linux

Prevents your Linux desktop from suspending while a Claude Code session is active.

## What it does

The plugin holds a systemd sleep inhibitor for the lifetime of each Claude session. The inhibitor is acquired at session start and released when the session ends. If the session crashes, the inhibitor expires naturally within the TTL (default 30 minutes).

Behavior at a glance:

- Open Claude → machine stays awake
- Work actively → stays awake; inhibitor is refreshed on every hook event
- Walk away idle → suspendable once the TTL expires (30 min with no Claude activity)
- Close session → inhibitor released immediately
- Crash → inhibitor released within 30 minutes

Linux only. No configuration needed beyond installation.

## Install

```
/plugin install keep-awake-linux@claude-dev-tools
```

No manual `settings.json` edits required — hooks are registered automatically.

### Runtime dependencies

| Tool | Package | Install if absent |
|---|---|---|
| `systemd-inhibit` | `systemd` | Present on all standard Linux desktops |
| `jq` | `jq` | `sudo apt install jq` or `sudo dnf install jq` |

If either dependency is missing, the plugin emits a warning to stderr and exits cleanly — it never blocks Claude from starting.

## How it works

Every hook fires `keep-awake hook <event>`, which reads the session ID from stdin JSON and acquires or releases the inhibitor.

| Hook event | Matcher | Action |
|---|---|---|
| `SessionStart` | `*` | Acquire inhibitor for this session |
| `UserPromptSubmit` | `*` | Refresh inhibitor (reset TTL) |
| `PreToolUse` | `*` | Refresh inhibitor (reset TTL) |
| `PostToolUse` | `*` | Refresh inhibitor (reset TTL) |
| `SessionEnd` | `*` | Release inhibitor immediately |

Each session gets its own inhibitor process. Logind aggregates all active inhibitors, so multi-session correctness comes for free — opening a second Claude window adds an inhibitor; closing it removes only that one.

The TTL is implemented by passing it as the sleep duration to `systemd-inhibit`. On every activity event the old inhibitor is replaced with a fresh one (zero-gap swap: the new inhibitor is live before the old one is killed), effectively resetting the clock.

`Stop`, `StopFailure`, and `Notification` are not wired. Those events fire within a turn; because the inhibitor is session-scoped and refreshed per-turn, there is no need for sub-turn precision.

## Inspect state

Check which sessions are active:

```
keep-awake status
```

Example output when no sessions are running:

```
STATE_DIR: /run/user/1000/claude-keep-awake
  (no sessions)
```

Cross-check with logind directly:

```
systemd-inhibit --list | grep claude-keep-awake
```

State files live at:

```
$XDG_RUNTIME_DIR/claude-keep-awake/sessions/
```

Fallback when `XDG_RUNTIME_DIR` is unset:

```
/tmp/claude-keep-awake-$UID/sessions/
```

Each active session is tracked by a `<session_id>.pid` file in that directory.

**Activity log:** every hook fire and every spawn/refresh/release writes one line to `keep-awake.log` in the state directory. Useful for debugging whether hooks are wired correctly after install:

```
tail -f "$XDG_RUNTIME_DIR/claude-keep-awake/keep-awake.log"
```

Sample lines:

```
2026-05-16T19:00:11+0200 hook=UserPromptSubmit sid=abc12345 verb=- outcome=routed-to-start
2026-05-16T19:00:11+0200 hook=- sid=abc12345 verb=start outcome=spawned new_pid=981437 old_pid=-
2026-05-16T19:00:14+0200 hook=PreToolUse sid=abc12345 verb=- outcome=routed-to-start
2026-05-16T19:00:14+0200 hook=- sid=abc12345 verb=start outcome=refreshed new_pid=981502 old_pid=981437
2026-05-16T19:00:45+0200 hook=SessionEnd sid=abc12345 verb=- outcome=routed-to-stop
2026-05-16T19:00:45+0200 hook=- sid=abc12345 verb=stop outcome=killed pid=981502
```

The log auto-rotates at 1 MiB (one archive kept as `keep-awake.log.1`). Disable with `KEEP_AWAKE_LOG=0`.

## Configuration & limits

**`KEEP_AWAKE_TTL`** — inhibitor lifetime in seconds (default `1800`). Increase this if you have very long turns with no hook events; decrease it for faster crash recovery.

```
KEEP_AWAKE_TTL=3600 claude   # keep awake for up to 1 hour of inactivity
```

**logind inhibitor cap** — logind enforces a maximum number of simultaneous inhibitors via `InhibitorsMax` in `/etc/systemd/logind.conf` (default `8192`). Hitting this limit in normal use is extremely unlikely, but it is documented in the logind man page for completeness.

**Container environments** — `systemd-inhibit` requires access to the host's logind socket. In containers where logind is not available, the plugin no-ops gracefully.

## Troubleshooting & uninstall

**Inhibitor not appearing in `systemd-inhibit --list`?**

Run `keep-awake status` first. If it shows `(no sessions)`, no session is currently active. If it shows a session marked `dead`, the inhibitor process exited unexpectedly — this can happen if the TTL elapsed or the process was killed externally.

**Stale marker file after manual cleanup?**

Remove the session manually:

```
keep-awake stop <session_id>
```

Or delete the marker file directly from the state directory.

**Uninstall:**

```
/plugin uninstall keep-awake-linux@claude-dev-tools
rm -rf $XDG_RUNTIME_DIR/claude-keep-awake/
```
