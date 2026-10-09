#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/plugins/revier/skills/revier/scripts/past-use.py"

PASS=0
FAIL=0

ok()   { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then ok "$label"; else
    fail "$label — expected $(printf '%q' "$expected"), got $(printf '%q' "$actual")"; fi
}
assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then ok "$label"; else
    fail "$label — expected to contain $(printf '%q' "$needle")"; fi
}

# A stand-in `revier` on PATH: `events` prints $FAKE/events and its stderr, `list` prints $FAKE/list.
FAKE=$(mktemp -d) || { printf 'FAIL: mktemp -d unavailable — fixtures cannot be built\n'; exit 1; }
trap 'rm -rf "$FAKE"' EXIT
cat > "$FAKE/revier" <<'EOF'
#!/usr/bin/env bash
dir=$(dirname "$0")
case "$1" in
  events)
    echo "$*" > "$dir/args"
    if [[ -f "$dir/no-events" ]]; then echo 'revier: unknown command "events"' >&2; exit 1; fi
    echo 'revier: warning: no events from gone' >&2
    cat "$dir/events" ;;
  list) cat "$dir/list" ;;
esac
EOF
chmod +x "$FAKE/revier"
# TZ is two hours east of UTC, so a host line of 22:30Z is on the next day here.
run() { TZ=UTC-2 PATH="$FAKE:$PATH" python3 "$SCRIPT" "$@"; }

cat > "$FAKE/list" <<'EOF'
[{"project": {"name": "busy", "path": "/src/busy"}},
 {"project": {"name": "far", "path": "/src/app", "remote": {"host": "box", "project": "app"}}},
 {"project": {"name": "far2", "path": "/src/app", "remote": {"host": "box", "project": "app"}}},
 {"project": {"name": "api", "path": "/src/api", "remote": {"host": "box", "project": "api-v2"}}}]
EOF
cat > "$FAKE/events" <<'EOF'
{"time":"2026-10-06T09:00:00+02:00","event":"go","project":"toggled","target":"home"}
{"time":"2026-10-06T09:01:00+02:00","event":"go","project":"toggled","target":"home"}
{"time":"2026-10-06T09:02:00+02:00","event":"go","project":"toggled","target":"home"}
{"time":"2026-10-06T09:03:00+02:00","event":"go agent","project":"toggled","agent":"claude","session":"s-3"}
{"time":"2026-10-06T10:00:00+02:00","event":"go","project":"busy","target":"home","launched":true}
{"time":"2026-10-06T10:00:01+02:00","event":"agent session","project":"busy","agent":"claude","session":"s-1","dir":"/src/busy"}
{"time":"2026-10-07T10:00:00+02:00","event":"agent session","project":"busy","agent":"claude","session":"s-1","dir":"/src/busy"}
{"time":"2026-10-08T10:00:00+02:00","event":"agent session","project":"busy","agent":"claude","session":"s-1","dir":"/src/busy/wt"}
{"time":"2026-10-08T11:00:00+02:00","event":"action","project":"busy","action":"build"}
{"time":"2026-10-08T10:00:00Z","event":"agent session","host":"box","project":"app","agent":"claude","session":"s-2","dir":"/src/app"}
{"time":"2026-10-08T12:00:05+02:00","event":"agent session","project":"far","agent":"claude","session":"s-2"}
{"time":"2026-10-08T12:10:00+02:00","event":"action","project":"quiet","action":"build"}
{"time":"2026-10-08T10:30:00Z","event":"action","host":"box","project":"app","action":"sync"}
{"time":"2026-10-08T11:00:00Z","event":"go","host":"box","project":"other","target":"home"}
{"time":"2026-10-08T14:00:00+02:00","event":"action","host":"elsewhere","project":"far","action":"sync"}
{"time":"2026-10-08T15:00:00+02:00","event":"go","project":"far2","target":"home"}
{"time":"2026-10-08T13:30:00Z","event":"go","host":"box","project":"api-v2","target":"home"}
{"time":"2026-10-08T13:40:00Z","event":"go","host":"box","project":"api","target":"home"}
{"time":"2026-10-08T22:30:00.123456789Z","event":"action","host":"box","project":"app","action":"sync"}
EOF

out=$(run --days 3 2>"$FAKE/stderr")
assert_eq "exit 0 on events" 0 $?
assert_eq "arguments reach revier events" "events --days 3" "$(cat "$FAKE/args")"
assert_contains "stderr of revier passes through" "no events from gone" "$(cat "$FAKE/stderr")"

assert_eq "active days rank first, then go presses, then the newest event" "far busy toggled api api other far quiet" "$(jq -r .project <<< "$out" | xargs)"
assert_eq "a day with agent session lines alone is no day" "2026-10-06 2026-10-08" "$(jq -r 'select(.project == "busy") | .days | join(" ")' <<< "$out")"
assert_eq "a count per event kind" '{"go":1,"action":1}' "$(jq -c 'select(.project == "busy") | .events' <<< "$out")"
assert_eq "the last event time" "2026-10-08T11:00:00+02:00" "$(jq -r 'select(.project == "busy") | .last' <<< "$out")"
assert_eq "the last event time of two UTC offsets is the newest one" "2026-10-08T22:30:00.123456789Z" "$(jq -r 'select(.host_project == "app") | .last' <<< "$out")"
assert_eq "a day is a date on the clock of this machine" "2026-10-08 2026-10-09" "$(jq -r 'select(.host_project == "app") | .days | join(" ")' <<< "$out")"
assert_eq "a session seen on three days is listed once, in its newest directory" '[{"agent":"claude","session":"s-1","dir":"/src/busy/wt"}]' "$(jq -c 'select(.project == "busy") | .sessions' <<< "$out")"
assert_eq "a session that only a go agent names is listed" '[{"agent":"claude","session":"s-3","dir":null}]' "$(jq -c 'select(.project == "toggled") | .sessions' <<< "$out")"

assert_eq "a link and its host project are one row" "far" "$(jq -r 'select(.project == "app" or .host_project == "app") | .project' <<< "$out")"
assert_eq "two links to one host project are one row, with the events of both" 1 "$(jq 'select(.host_project == "app") | .events.go' <<< "$out")"
assert_eq "the second link has no row of its own" "" "$(jq -r 'select(.project == "far2") | .project' <<< "$out")"
assert_eq "the link row names its host" "box" "$(jq -r 'select(.host_project == "app") | .host' <<< "$out")"
assert_eq "another host's project with the name of a link stays its own row" "null" "$(jq -r 'select(.project == "far" and .host == "elsewhere") | .host_project' <<< "$out")"
assert_eq "a link and an unlinked project of its host with the same name are two rows" "api-v2 null" "$(jq -r 'select(.project == "api") | .host_project' <<< "$out" | sort | xargs)"
assert_eq "a session both machines saw is listed once" 1 "$(jq 'select(.host_project == "app") | .sessions | length' <<< "$out")"
assert_eq "a line without a directory keeps the one its session has" "/src/app" "$(jq -r 'select(.host_project == "app") | .sessions[0].dir' <<< "$out")"
assert_eq "the host's actions count for the link" 2 "$(jq 'select(.host_project == "app") | .events.action' <<< "$out")"
assert_eq "a host project without a link keeps its host" "box" "$(jq -r 'select(.project == "other") | .host' <<< "$out")"
assert_eq "a project of this machine has no host" "null" "$(jq -r 'select(.project == "busy") | .host' <<< "$out")"

usage=$(run --help 2>&1)
assert_eq "--help: exit 0" 0 $?
assert_contains "--help: the usage of the script, not rows" "Usage: past-use.py" "$usage"

touch "$FAKE/no-events"
message=$(run 2>&1 >/dev/null)
code=$?
if [[ "$code" -ne 0 ]]; then ok "a revier without events: non-zero exit"; else fail "a revier without events: expected non-zero exit, got 0"; fi
assert_contains "a revier without events: the message says so" "this revier has no \`events\` command" "$message"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
