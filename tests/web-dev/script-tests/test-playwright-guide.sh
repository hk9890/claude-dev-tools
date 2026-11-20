#!/usr/bin/env bash
# web-dev-playwright-guide finds the agent skill that a stub playwright-cli names in its --help,
# relative to the cwd, and prints a STOP line where it cannot.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/plugins/web-dev/bin/web-dev-playwright-guide"

PASS=0
FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }
assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if grep -qF -- "$needle" <<< "$haystack"; then ok "$label"; else
    fail "$label — expected to contain $(printf '%q' "$needle")"; fi
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/pkg/skills/playwright-cli" "$WORK/cwd"
printf '# Browser Automation with playwright-cli\n' > "$WORK/pkg/skills/playwright-cli/SKILL.md"

# A stub playwright-cli whose --help prints the given skill path on its third line, as 0.1.24 does.
stub() {
  cat > "$WORK/bin/playwright-cli" <<STUB
#!/usr/bin/env bash
printf 'playwright-cli - run playwright mcp commands from terminal\n\n%s\n\nUsage: playwright-cli <command>\n' "$1"
STUB
  chmod +x "$WORK/bin/playwright-cli"
}

run() { (cd "$WORK/cwd" && PATH="$WORK/bin:/usr/bin:/bin" bash "$SCRIPT" 2>&1); }

stub 'Agent skill: ../pkg/skills/playwright-cli/SKILL.md'
out=$(run)
assert_contains "prints the guide directory" "Guide directory: $WORK/pkg/skills/playwright-cli" "$out"
assert_contains "prints the guide" "# Browser Automation with playwright-cli" "$out"

stub 'Agent skill: ../pkg/skills/missing/SKILL.md'
assert_contains "a path that leads nowhere stops" "STOP: the agent skill that playwright-cli --help names does not exist" "$(run)"

stub 'no skill line'
assert_contains "help with no skill line stops" "STOP: playwright-cli --help names no agent skill." "$(run)"

rm "$WORK/bin/playwright-cli"
assert_contains "a missing playwright-cli stops" "STOP: playwright-cli is not on PATH." "$(run)"

echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
