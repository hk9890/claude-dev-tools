#!/usr/bin/env bash
# test-skill-invocations.sh — a skill the model is told to invoke is one it can reach.
#
# The `Skill` tool cannot load a user-only skill (`disable-model-invocation: true`), and
# nothing reports the miss: the caller names the skill, the model finds none by that
# name, and the step is skipped or improvised. This walks every "invoke `plugin:skill`"
# sentence under plugins/ whose plugin half is a plugin of this repo, and requires the
# target to be model-invocable.
#
# Exit codes: 0 — all assertions passed; 1 — one or more failed.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

PASS=0
FAIL=0
ok()   { printf 'PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }

# True when the SKILL.md at $1 carries no `disable-model-invocation: true` in its frontmatter.
model_invocable() {
  ! awk 'NR==1 && $0=="---"{inb=1; next} inb && $0=="---"{exit} inb' "$1" \
    | grep -q '^disable-model-invocation:[[:space:]]*true'
}

# The predicate has to be able to fail, or every assertion below passes for nothing.
FIXTURE="$(mktemp)" || { printf 'FAIL: mktemp failed\n' >&2; exit 1; }
trap 'rm -f "$FIXTURE"' EXIT
printf '%s\n' '---' 'name: x' 'user-invocable: true' 'disable-model-invocation: true' '---' 'body' > "$FIXTURE"
if model_invocable "$FIXTURE"; then
  fail "predicate: a user-only skill is reported as model-invocable"
else
  ok "predicate: a user-only skill is reported as unreachable"
fi

mapfile -t HITS < <(
  grep -rnoE --include='*.md' --include='*.js' \
    '[Ii]nvoke (the )?`[a-z0-9-]+:[a-z0-9-]+`' "$REPO_ROOT/plugins" | sort -u
)

CHECKED=0
for hit in "${HITS[@]}"; do
  file="${hit%%:*}"
  rest="${hit#*:}"
  line="${rest%%:*}"
  ref="$(sed -E 's/.*`([a-z0-9-]+:[a-z0-9-]+)`.*/\1/' <<< "$hit")"
  plugin="${ref%%:*}"
  skill="${ref#*:}"
  # A plugin this repo does not ship is not checkable from here.
  [[ -d "$REPO_ROOT/plugins/$plugin" ]] || continue

  CHECKED=$((CHECKED + 1))
  label="${file#"$REPO_ROOT"/}:$line invokes $ref"
  target="$REPO_ROOT/plugins/$plugin/skills/$skill/SKILL.md"
  if [[ ! -f "$target" ]]; then
    fail "$label — no such skill"
  elif model_invocable "$target"; then
    ok "$label — model-invocable"
  else
    fail "$label — the target is user-only, so the Skill tool cannot reach it"
  fi
done

if [[ "$CHECKED" -eq 0 ]]; then
  fail "no invocation of a local skill found under plugins/ — the scanner matches nothing"
fi

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
