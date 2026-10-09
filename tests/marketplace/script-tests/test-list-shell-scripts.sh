#!/usr/bin/env bash
# test-list-shell-scripts.sh — pin scripts/list-shell-scripts.sh's coverage against drift.
#
# `mise run lint` and the CI shellcheck job both depend on this list. It must keep
# catching extensionless shell scripts under a plugin's bin/ without pulling in non-shell
# bin/ scripts (html-visualization's bin/server.js, a Node script). No plugin ships an
# extensionless shell script today, so that case runs against a throwaway repository.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/scripts/list-shell-scripts.sh"

PASS=0
FAIL=0
ok()   { printf 'PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }

[[ -f "$SCRIPT" ]] || { printf 'FAIL: %s not found\n' "$SCRIPT" >&2; exit 1; }

output="$(cd "$REPO_ROOT" && bash "$SCRIPT")"

FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/plugins/demo/bin"
printf '#!/usr/bin/env bash\necho hi\n' > "$FIXTURE/plugins/demo/bin/tool"
printf '#!/usr/bin/env -S bash -eu\necho hi\n' > "$FIXTURE/plugins/demo/bin/strict"
printf '#!/usr/bin/env bash\necho hi\n' > "$FIXTURE/plugins/demo/bin/helper.sh"
printf '#!/usr/bin/env node\n' > "$FIXTURE/plugins/demo/bin/server"
git -C "$FIXTURE" init -q && git -C "$FIXTURE" add -A
fixture_output="$(cd "$FIXTURE" && bash "$SCRIPT")"
fixture_expected=$'plugins/demo/bin/helper.sh\nplugins/demo/bin/strict\nplugins/demo/bin/tool'

if [[ "$fixture_output" == "$fixture_expected" ]]; then
  ok "each shell script under a plugin bin/ is listed once, shebang flags or a .sh extension included; a node one beside them is not"
else
  fail "fixture: expected $fixture_expected, got: $fixture_output"
fi

if grep -qF "plugins/html-visualization/bin/server.js" <<<"$output"; then
  fail "plugins/html-visualization/bin/server.js (a Node script) should not be included"
else
  ok "non-shell bin/ script is excluded"
fi

if grep -qF "tests/run-all.sh" <<<"$output"; then
  ok "an ordinary tracked *.sh file is still included"
else
  fail "tests/run-all.sh missing from the list"
fi

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
