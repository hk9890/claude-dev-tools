#!/usr/bin/env bash
# test-keep-awake.sh — lifecycle and concurrency tests for bin/keep-awake.
#
# The concurrency cases pin the fix for a leak that shipped: do_start, do_stop
# and gc each read a session marker, act, then rewrite or unlink it. Unlocked,
# racing invocations each spawned an inhibitor while only the last marker write
# survived, so the losers became untracked — no marker named them, so neither
# do_stop nor gc could ever reap them and they held the machine awake for a
# full TTL past session exit. Every "exactly one inhibitor" assertion below
# fails if that locking regresses.
#
# Inhibitors are counted from logind (systemd-inhibit --list), not pgrep: the
# question is what the system will actually honour, and a pgrep count also
# matches the harness's own shell.
#
# Exits 77 (skip) where logind cannot register an inhibitor — the plugin no-ops
# there. Set REQUIRE_LOGIND=1 to turn that skip into a hard failure instead, for
# CI that must exercise this path.

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/keep-awake-linux/bin/keep-awake"

[[ -x "$SCRIPT" ]] || { echo "FAIL: $SCRIPT is not executable"; exit 1; }

skip_or_fail() {
  if [[ "${REQUIRE_LOGIND:-0}" == "1" ]]; then
    echo "FAIL: $1 (REQUIRE_LOGIND=1)"
    exit 1
  fi
  echo "SKIP: $1"
  exit 77
}

command -v systemd-inhibit >/dev/null 2>&1 || skip_or_fail "systemd-inhibit not available"

# The binary existing is not the capability these tests need. A sandbox can ship
# systemd-inhibit yet refuse to register the lock: the helper still spawns and
# still writes a marker, but nothing appears in --list, so every count below
# reads 0 and the suite reports failures that describe the sandbox rather than
# the code. Probe the real thing — and probe it with the *same* --what the
# helper uses: a container without suspend capability accepts a bare `idle` lock
# while rejecting `idle:sleep`, so a laxer probe passes and the suite then fails
# on locks that were never taken.
probe_tag="kaprobe$$"
setsid systemd-inhibit --what=idle:sleep --who="$probe_tag" --why="capability probe" \
  --mode=block sleep 5 >/dev/null 2>&1 &
probe_pid=$!
probe_ok=1
for ((probe_i = 0; probe_i < 30; probe_i++)); do
  if systemd-inhibit --list 2>/dev/null | grep -q "$probe_tag"; then probe_ok=0; break; fi
  sleep 0.05
done
kill "$probe_pid" 2>/dev/null || true
[[ "$probe_ok" -eq 0 ]] || skip_or_fail "logind does not register inhibitors here"

PASS=0
FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# Unique per run so a stray inhibitor from an earlier run can never be counted.
RUN_TAG="kat$$"
TTL=45

# Every session id issued, so the EXIT trap can reap anything a failing
# assertion left behind rather than leaking it onto the developer's machine.
SIDS=()

inhibitors_for() { systemd-inhibit --list 2>/dev/null | grep -c "Claude session $1" || true; }

# systemd-inhibit is spawned in the background, so registration with logind lags
# the helper's exit by an unbounded moment. Poll rather than sleep a guessed
# interval: a bare check here reads 0 on a machine that is merely slow, which
# would fail the suite for a timing artefact rather than a real defect.
settle_for() {
  local sid="$1" want="$2" i
  for ((i = 0; i < 40; i++)); do
    [[ "$(inhibitors_for "$sid")" -eq "$want" ]] && return 0
    sleep 0.05
  done
  return 0
}
kill_session()   {
  systemd-inhibit --list 2>/dev/null | grep "Claude session $1" | awk '{print $4}' |
    xargs -r kill 2>/dev/null || true
}
cleanup() { for sid in "${SIDS[@]:-}"; do [[ -n "$sid" ]] && kill_session "$sid"; done; }
trap cleanup EXIT

new_sid() { local sid="$RUN_TAG-$1"; SIDS+=("$sid"); printf '%s\n' "$sid"; }
run()     { XDG_RUNTIME_DIR="$1" KEEP_AWAKE_TTL="$TTL" "$SCRIPT" "${@:2}"; }
marker()  { cat "$1/claude-keep-awake/sessions/$2.pid" 2>/dev/null || true; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then ok "$label"; else
    fail "$label — expected $(printf '%q' "$expected"), got $(printf '%q' "$actual")"; fi
}

# ── Lifecycle ────────────────────────────────────────────────────────────────

lifecycle() {
  local rt sid
  rt="$(mktemp -d)"; sid="$(new_sid life)"

  run "$rt" start "$sid" >/dev/null 2>&1
  settle_for "$sid" 1
  assert_eq "start: one inhibitor registered" 1 "$(inhibitors_for "$sid")"
  assert_eq "start: marker names the live inhibitor" \
    "$(systemd-inhibit --list 2>/dev/null | grep "Claude session $sid" | awk '{print $4}')" \
    "$(marker "$rt" "$sid")"

  local first; first="$(marker "$rt" "$sid")"
  run "$rt" start "$sid" >/dev/null 2>&1
  settle_for "$sid" 1
  assert_eq "refresh: still exactly one inhibitor" 1 "$(inhibitors_for "$sid")"
  [[ "$(marker "$rt" "$sid")" != "$first" ]] \
    && ok "refresh: marker advanced to the new inhibitor" \
    || fail "refresh: marker did not advance"

  run "$rt" status 2>/dev/null | grep -q "session=$sid" \
    && ok "status: reports the live session" || fail "status: did not report the session"

  run "$rt" stop "$sid" >/dev/null 2>&1
  settle_for "$sid" 0
  assert_eq "stop: inhibitor released" 0 "$(inhibitors_for "$sid")"
  run "$rt" status 2>/dev/null | grep -q "(no sessions)" \
    && ok "stop: status reports no sessions" || fail "stop: status still lists a session"

  rm -rf "$rt"
}

# ── Hook dispatch ────────────────────────────────────────────────────────────

hook_dispatch() {
  local rt sid; rt="$(mktemp -d)"; sid="$(new_sid hook)"
  command -v jq >/dev/null 2>&1 || { ok "hook: skipped, jq absent"; rm -rf "$rt"; return; }

  echo "{\"session_id\":\"$sid\"}" | run "$rt" hook SessionStart >/dev/null 2>&1
  settle_for "$sid" 1
  assert_eq "hook SessionStart: inhibitor spawned" 1 "$(inhibitors_for "$sid")"

  echo "{\"session_id\":\"$sid\"}" | run "$rt" hook PreToolUse >/dev/null 2>&1
  settle_for "$sid" 1
  assert_eq "hook PreToolUse: still one inhibitor" 1 "$(inhibitors_for "$sid")"

  echo "{\"session_id\":\"$sid\"}" | run "$rt" hook SessionEnd >/dev/null 2>&1
  settle_for "$sid" 0
  assert_eq "hook SessionEnd: inhibitor released" 0 "$(inhibitors_for "$sid")"

  local code=0
  echo '{"session_id":""}' | run "$rt" hook PreToolUse >/dev/null 2>&1 || code=$?
  assert_eq "hook: missing session_id exits 0 (never blocks Claude Code)" 0 "$code"

  rm -rf "$rt"
}

# ── Concurrency: N racing starts must yield exactly one inhibitor ────────────

concurrent_starts() {
  local n="$1" rt sid; rt="$(mktemp -d)"; sid="$(new_sid "start$n")"

  local i
  for ((i = 0; i < n; i++)); do run "$rt" start "$sid" >/dev/null 2>&1 & done
  wait 2>/dev/null
  settle_for "$sid" 1

  assert_eq "concurrency $n: exactly one inhibitor survives" 1 "$(inhibitors_for "$sid")"
  assert_eq "concurrency $n: no stray .tmp markers" 0 \
    "$(find "$rt/claude-keep-awake/sessions" -name '*.tmp' 2>/dev/null | wc -l | tr -d ' ')"

  run "$rt" stop "$sid" >/dev/null 2>&1
  settle_for "$sid" 0
  assert_eq "concurrency $n: stop leaves no orphan" 0 "$(inhibitors_for "$sid")"

  rm -rf "$rt"
}

# ── Concurrency: stop racing an in-flight start ─────────────────────────────
# SessionEnd routinely fires while a PostToolUse start is still running. If stop
# unlinks a marker that a concurrent start has just replaced, the inhibitor it
# named is orphaned: live, but unreferenced and therefore unreapable.

stop_races_start() {
  local trials="$1" leaked=0 i rt sid
  for ((i = 0; i < trials; i++)); do
    rt="$(mktemp -d)"; sid="$(new_sid "race$i")"
    run "$rt" start "$sid" >/dev/null 2>&1
    run "$rt" stop  "$sid" >/dev/null 2>&1 &
    run "$rt" start "$sid" >/dev/null 2>&1 &
    wait 2>/dev/null
    sleep 0.3
    # A leak is a live inhibitor with no marker naming it.
    if [[ "$(inhibitors_for "$sid")" -gt 0 && -z "$(marker "$rt" "$sid")" ]]; then
      leaked=$((leaked + 1))
    fi
    kill_session "$sid"
    rm -rf "$rt"
  done
  assert_eq "stop racing start: no untracked inhibitor in $trials trials" 0 "$leaked"
}

# ── Concurrency: gc sweeping while sessions start ───────────────────────────
# gc is global — it walks every session's marker — so a per-session lock only
# protects it if gc takes each session's lock as it goes.

gc_during_starts() {
  local n="$1" rt i untracked=0
  rt="$(mktemp -d)"
  local -a sids=()
  for ((i = 0; i < n; i++)); do sids+=("$(new_sid "gc$i")"); done
  for sid in "${sids[@]}"; do run "$rt" start "$sid" >/dev/null 2>&1 & done
  wait 2>/dev/null
  sleep 0.5

  for sid in "${sids[@]}"; do
    if [[ "$(inhibitors_for "$sid")" -gt 0 && -z "$(marker "$rt" "$sid")" ]]; then
      untracked=$((untracked + 1))
    fi
    kill_session "$sid"
  done
  assert_eq "gc during $n concurrent distinct sessions: none untracked" 0 "$untracked"
  rm -rf "$rt"
}

# ── Invalid input never blocks the harness ──────────────────────────────────

invalid_sid() {
  local rt code=0; rt="$(mktemp -d)"
  run "$rt" start 'bad;sid' >/dev/null 2>&1 || code=$?
  assert_eq "invalid session_id: exits 0 without spawning" 0 "$code"
  assert_eq "invalid session_id: no inhibitor" 0 "$(inhibitors_for 'bad;sid')"
  rm -rf "$rt"
}

lifecycle
hook_dispatch
invalid_sid
concurrent_starts 8
concurrent_starts 20
stop_races_start 12
gc_during_starts 20

echo
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
