#!/usr/bin/env bash
# test-skill-invocations.sh — a skill the model is told to invoke is one it can reach.
#
# The `Skill` tool cannot load a user-only skill (`disable-model-invocation: true`), and
# nothing reports the miss: the caller names the skill, the model finds none by that
# name, and the step is skipped or improvised. This walks every "Call the Skill tool with
# `plugin:skill`" sentence under plugins/ whose plugin half is a plugin of this repo, and
# requires the target to be model-invocable.
#
# A hand-off worded "invoke `plugin:skill`", "load `plugin:skill`" or "use the
# `plugin:skill` skill" fails: the agent skips a skill named in prose, so the
# writing-skills rubric asks for the explicit call.
#
# Both scans read each Markdown file whole, so a hand-off wrapped across lines is found.
# A hand-off whose target the text does not spell out ("call the Skill tool with it") is
# not checked.
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
  awk 'NR==1 && $0=="---"{inb=1; next}
       inb && $0=="---"{exit}
       inb && /^disable-model-invocation:[ \t]*true/{user_only=1; exit}
       END{exit user_only}' "$1"
}

NAME='`[a-z0-9-]+:[a-z0-9-]+`'
PROSE_RE="(?<![[:alpha:]])(?:[Ii]nvoke|[Ll]oad)\\s+(?:the\\s+)?$NAME|(?<![[:alpha:]])[Uu]se\\s+the\\s+$NAME\\s+skill"
CALL_RE="[Cc]all\\s+the\\s+[Ss]kill\\s+tool\\s+with\\s+$NAME"

# Prints "<file>:<line>:<plugin:skill>" for each match of the regex $1 in the Markdown
# files under $2, reading each file whole so a match may span lines.
scan() {
  find "$2" -name '*.md' -type f -print0 | sort -z |
    RE="$1" xargs -0 -r perl -0777 -ne '
      while (/$ENV{RE}/g) {
        my $line = (substr($_, 0, $-[0]) =~ tr/\n//) + 1;
        my ($ref) = $& =~ /`([a-z0-9-]+:[a-z0-9-]+)`/;
        print "$ARGV:$line:$ref\n";
      }'
}

# The predicate and both scanners have to be able to fail, or every assertion below
# passes for nothing.
FIXTURE_DIR="$(mktemp -d)" || { printf 'FAIL: mktemp failed\n' >&2; exit 1; }
trap 'rm -rf "$FIXTURE_DIR"' EXIT
printf '%s\n' '---' 'name: x' 'user-invocable: true' 'disable-model-invocation: true' '---' 'body' > "$FIXTURE_DIR/user-only.txt"
if model_invocable "$FIXTURE_DIR/user-only.txt"; then
  fail "predicate: a user-only skill is reported as model-invocable"
else
  ok "predicate: a user-only skill is reported as unreachable"
fi
printf '%s\n' 'Then call the Skill tool' 'with `a:b`. Load' '`c:d`. Use the `e:f` skill. Reload `g:h`.' > "$FIXTURE_DIR/wrapped.md"
fixture_calls="$(scan "$CALL_RE" "$FIXTURE_DIR" | cut -d: -f2- | tr '\n' ' ')"
fixture_prose="$(scan "$PROSE_RE" "$FIXTURE_DIR" | cut -d: -f2- | tr '\n' ' ')"
if [[ "$fixture_calls" == "1:a:b " ]]; then
  ok "scanner: a Skill tool call wrapped across lines is found"
else
  fail "scanner: expected the wrapped call 1:a:b, found '$fixture_calls'"
fi
if [[ "$fixture_prose" == "2:c:d 3:e:f " ]]; then
  ok "scanner: a wrapped load and a use-the-skill hand-off are found, a reload is not"
else
  fail "scanner: expected the prose hand-offs 2:c:d 3:e:f, found '$fixture_prose'"
fi

mapfile -t PROSE < <(scan "$PROSE_RE" "$REPO_ROOT/plugins")
for hit in "${PROSE[@]}"; do
  file="${hit%%:*}"
  rest="${hit#*:}"
  fail "${file#"$REPO_ROOT"/}:${rest%%:*} — a hand-off in prose; write \"Call the Skill tool with\" for a skill, or name the Agent tool for an agent"
done

mapfile -t HITS < <(scan "$CALL_RE" "$REPO_ROOT/plugins")

CHECKED=0
for hit in "${HITS[@]}"; do
  file="${hit%%:*}"
  rest="${hit#*:}"
  line="${rest%%:*}"
  ref="${rest#*:}"
  plugin="${ref%%:*}"
  skill="${ref#*:}"
  # A plugin this repo does not ship is not checkable from here.
  [[ -d "$REPO_ROOT/plugins/$plugin" ]] || continue

  CHECKED=$((CHECKED + 1))
  label="${file#"$REPO_ROOT"/}:$line invokes $ref"
  target="$REPO_ROOT/plugins/$plugin/skills/$skill/SKILL.md"
  if [[ -f "$REPO_ROOT/plugins/$plugin/agents/$skill.md" ]]; then
    fail "$label — an agent, which the Agent tool starts, not the Skill tool"
  elif [[ ! -f "$target" ]]; then
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
