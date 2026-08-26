#!/usr/bin/env bash
# test-skill-frontmatter.sh — the frontmatter rules in docs/CODING.md, checked
# across every skill in the marketplace rather than one at a time.
#
# All three rules here have been half-applied at least once: some skills followed
# them and their siblings did not, which is invisible when you only read the skill
# in front of you. That is what a repo-wide check is for.
#
#   1. Schema A and Schema B are never mixed — `disable-model-invocation: true`
#      alongside `when_to_use:` is contradictory.
#   2. `argument-hint` and `$ARGUMENTS` are declared together or not at all, so a
#      skill never advertises an argument it ignores or hides one it takes.
#   3. A skill that takes an argument says what an empty one does. Three
#      project-execute skills shipped without this while three siblings had it.
#
# Exit codes: 0 — all assertions passed; 1 — one or more failed.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

PASS=0
FAIL=0
ok()   { printf 'PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }

mapfile -t SKILLS < <(find "$REPO_ROOT/plugins" -path '*/skills/*/SKILL.md' | sort)
if [[ "${#SKILLS[@]}" -eq 0 ]]; then
  printf 'FAIL: no SKILL.md files found under plugins/\n' >&2
  exit 1
fi
ok "found ${#SKILLS[@]} skills to check"

for f in "${SKILLS[@]}"; do
  name="$(basename "$(dirname "$f")")"
  plugin="$(sed -E 's|.*/plugins/([^/]+)/.*|\1|' <<< "$f")"
  label="$plugin:$name"

  # Frontmatter is the block between the first two --- lines.
  fm="$(awk 'NR==1 && $0=="---"{inb=1; next} inb && $0=="---"{exit} inb' "$f")"
  body="$(awk 'NR==1 && $0=="---"{inb=1; next} inb && $0=="---"{inb=0; next} !inb' "$f")"

  # 1. directory name and frontmatter name agree
  fm_name="$(sed -nE 's/^name:[[:space:]]*(.*)$/\1/p' <<< "$fm" | tr -d '"'"'"' ')"
  if [[ "$fm_name" == "$name" ]]; then
    ok "$label: frontmatter name matches its directory"
  else
    fail "$label: frontmatter name is '$fm_name' but the directory is '$name'"
  fi

  # 2. schemas are not mixed
  has_wtu=0; grep -q '^when_to_use:' <<< "$fm" && has_wtu=1
  has_dmi=0; grep -q '^disable-model-invocation:[[:space:]]*true' <<< "$fm" && has_dmi=1
  if [[ "$has_wtu" -eq 1 && "$has_dmi" -eq 1 ]]; then
    fail "$label: mixes Schema A and B — disable-model-invocation:true beside when_to_use"
  else
    ok "$label: schema is unmixed"
  fi

  # 3. argument-hint and $ARGUMENTS travel together
  has_hint=0; grep -q '^argument-hint:' <<< "$fm" && has_hint=1
  has_args=0; grep -Fq '$ARGUMENTS' <<< "$body" && has_args=1
  if [[ "$has_hint" -eq "$has_args" ]]; then
    ok "$label: argument-hint and \$ARGUMENTS agree"
  elif [[ "$has_hint" -eq 1 ]]; then
    fail "$label: declares argument-hint but never consumes \$ARGUMENTS"
  else
    fail "$label: consumes \$ARGUMENTS but declares no argument-hint"
  fi

  # 4. a skill that takes an argument says what an empty one does.
  # This is a keyword heuristic over the phrasings the marketplace actually uses
  # ("With no scope, …", "Default: the whole codebase", "or nothing when …"). It
  # cannot judge whether the sentence is any good — it catches the case that has
  # actually shipped twice, where a skill says nothing at all about an empty
  # argument. Add a phrasing here when a skill legitimately uses a new one.
  if [[ "$has_hint" -eq 1 ]]; then
    # Match against the body with newlines collapsed: several skills wrap the
    # phrase across a line break ("given directly, or\nnothing when …"), which a
    # line-oriented grep would miss and report as a violation.
    flat="$(tr '\n' ' ' <<< "$body" | tr -s ' ')"
    if grep -qiE 'with no [a-z-]+|with none given|no argument|nothing when|defaults? to|default:|\*\*absent\*\*|if no [a-z-]+ (token )?is given' <<< "$flat"; then
      ok "$label: states what an empty argument does"
    else
      fail "$label: takes an argument but never says what an empty one does (docs/CODING.md)"
    fi
  fi
done

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
