#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/plugins/revier/skills/revier/scripts/find-project.py"

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

# A stand-in `revier` on PATH: `list` prints $FAKE/list, or fails where $FAKE/broken exists.
FAKE=$(mktemp -d) || { printf 'FAIL: mktemp -d unavailable — fixtures cannot be built\n'; exit 1; }
trap 'rm -rf "$FAKE"' EXIT
cat > "$FAKE/revier" <<'EOF'
#!/usr/bin/env bash
dir=$(dirname "$0")
echo "$*" > "$dir/args"
if [[ -f "$dir/broken" ]]; then echo 'revier: config is broken' >&2; exit 3; fi
cat "$dir/list"
EOF
chmod +x "$FAKE/revier"
run() { PATH="$FAKE:$PATH" python3 "$SCRIPT" "$@"; }

cat > "$FAKE/list" <<'EOF'
[{"project": {"name": "task-manager", "path": "/src/task-manager", "git_url": "https://github.com/me/task-manager.git"}},
 {"project": {"name": "shop", "path": "/src/webshop/", "git_url": "git@github.com:me/Storefront.git"},
  "agents": [{"target": "home", "panel": "7", "state": {"status": "idle", "activity": "Checkout redesign", "name": "shop-a1"}},
             {"panel": "9", "state": {"status": "running", "activity": "Checkout tests"}},
             {"target": "home", "panel": "8", "state": {"status": "idle", "activity": "Release notes"}}]},
 {"project": {"name": "far", "path": "/src/app", "remote": {"host": "box", "project": "api-v2"}}}]
EOF

out=$(run task webshop storefront api-v2 checkout shop-a1 nothing 2>"$FAKE/stderr")
assert_eq "exit 0" 0 $?
assert_eq "the whole list is read" "list --json" "$(cat "$FAKE/args")"

assert_eq "a part of the name" '["name","dir","repo"]' "$(jq -c 'select(.word == "task") | .matched' <<< "$out")"
assert_eq "the last part of the checkout path" "shop dir" "$(jq -r 'select(.word == "webshop") | "\(.project) \(.matched | join(" "))"' <<< "$out")"
assert_eq "the repository name, in any case" "shop repo" "$(jq -r 'select(.word == "storefront") | "\(.project) \(.matched | join(" "))"' <<< "$out")"
assert_eq "a link's project on its host" "far host_project" "$(jq -r 'select(.word == "api-v2") | "\(.project) \(.matched | join(" "))"' <<< "$out")"
assert_eq "an activity names the agents it matches, and no other" '[{"address":"shop:home:7","activity":"Checkout redesign","name":"shop-a1","status":"idle"},{"address":null,"activity":"Checkout tests","name":null,"status":"running"}]' "$(jq -c 'select(.word == "checkout") | .agents' <<< "$out")"
assert_eq "an agent with no target has no address" "null" "$(jq -r 'select(.word == "checkout") | .agents[1].address' <<< "$out")"
assert_eq "the harness's name of an agent" "shop:home:7" "$(jq -r 'select(.word == "shop-a1") | .agents[0].address' <<< "$out")"
assert_eq "a project matched by name only has no agents" "null" "$(jq -r 'select(.word == "task") | .agents' <<< "$out")"
assert_eq "a word that names nothing" '{"word":"nothing","project":null}' "$(jq -c 'select(.word == "nothing")' <<< "$out")"

usage=$(run --help 2>&1)
assert_eq "--help: exit 0" 0 $?
assert_contains "--help: the usage of the script" "Usage: find-project.py" "$usage"
assert_contains "no word: the usage" "Usage: find-project.py" "$(run 2>&1)"

touch "$FAKE/broken"
message=$(run shop 2>&1 >/dev/null)
assert_eq "a failing revier: its exit code" 3 $?
assert_contains "a failing revier: its message passes through" "config is broken" "$message"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
