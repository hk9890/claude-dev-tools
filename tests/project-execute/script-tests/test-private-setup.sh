#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/plugins/project-execute/skills/project-exec-init/scripts/private-setup.sh"

PASS=0
FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }
assert_eq() {
  if [[ "$2" == "$3" ]]; then ok "$1"; else fail "$1 — expected $(printf '%q' "$2"), got $(printf '%q' "$3")"; fi
}

# The script reads the user's global gitignore, so each test hands git a global config of its own.
SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
export GIT_CONFIG_GLOBAL="$SANDBOX/gitconfig" GIT_CONFIG_NOSYSTEM=1
printf 'CLAUDE.local.md\n.worktreeinclude\nmy-notes/\n' > "$SANDBOX/ignore"
git config --global core.excludesFile "$SANDBOX/ignore"
git config --global user.name test
git config --global user.email test@example.invalid
git config --global init.defaultBranch main

make_repo() {
  local dir; dir=$(mktemp -d "$SANDBOX/repo-XXXXXX")
  git -C "$dir" init -q
  printf '# r\n' > "$dir/README.md"
  git -C "$dir" add README.md
  git -C "$dir" commit -q -m init
  echo "$dir"
}
# The folder name is the user's choice; my-notes here, so no default name can pass.
run_in() { (cd "$1" && bash "$SCRIPT" my-notes); }
run_bare() { (cd "$1" && bash "$SCRIPT"); }

test_outside_git() {
  local dir; dir=$(mktemp -d "$SANDBOX/plain-XXXXXX")
  local code=0; run_in "$dir" >/dev/null 2>&1 || code=$?
  assert_eq "outside a git checkout: exit 1" "1" "$code"
}

test_setup() {
  local dir; dir=$(make_repo)
  run_in "$dir" >/dev/null
  assert_eq "setup: CLAUDE.local.md is the absolute import" "@$dir/my-notes/AGENTS.md" "$(cat "$dir/CLAUDE.local.md")"
  assert_eq "setup: .worktreeinclude names CLAUDE.local.md" "CLAUDE.local.md" "$(cat "$dir/.worktreeinclude")"
  assert_eq "setup: my-notes/docs exists" "yes" "$([[ -d "$dir/my-notes/docs" ]] && echo yes)"
  assert_eq "setup: AGENTS.md is committed in the local repository" "AGENTS.md" "$(git -C "$dir/my-notes" ls-files)"
  assert_eq "setup: the private repository has no remote" "" "$(git -C "$dir/my-notes" remote)"
  assert_eq "setup: the checkout stays clean" "" "$(git -C "$dir" status --porcelain)"
  local again; again=$(run_bare "$dir")
  assert_eq "rerun with no name: every file kept" "4" "$(grep -c '^kept' <<< "$again")"
  assert_eq "rerun with no name: the folder comes from the import" "folder  my-notes" "$(tail -n 1 <<< "$again")"
  assert_eq "rerun: CLAUDE.local.md unchanged" "@$dir/my-notes/AGENTS.md" "$(cat "$dir/CLAUDE.local.md")"
  local code=0; (cd "$dir" && bash "$SCRIPT" other-notes) >/dev/null 2>&1 || code=$?
  assert_eq "a second folder beside the imported one: exit 1" "1" "$code"
}

test_name_needed() {
  local dir; dir=$(make_repo)
  local code=0; run_bare "$dir" >/dev/null 2>&1 || code=$?
  assert_eq "no name and no import: exit 2" "2" "$code"
  assert_eq "no name and no import: nothing written" "no" "$([[ -e "$dir/CLAUDE.local.md" ]] && echo yes || echo no)"
  code=0; (cd "$dir" && bash "$SCRIPT" ../up) >/dev/null 2>&1 || code=$?
  assert_eq "a name with a slash: exit 1" "1" "$code"
}

test_existing_notes() {
  local dir; dir=$(make_repo)
  printf 'Personal note.' > "$dir/CLAUDE.local.md"
  printf 'other.env' > "$dir/.worktreeinclude"
  run_in "$dir" >/dev/null
  assert_eq "notes: the import is added, the notes kept" "Personal note.|@$dir/my-notes/AGENTS.md" "$(grep -v '^$' "$dir/CLAUDE.local.md" | paste -sd'|')"
  assert_eq "notes: .worktreeinclude keeps its line" "other.env|CLAUDE.local.md" "$(paste -sd'|' "$dir/.worktreeinclude")"
}

test_not_ignored() {
  local dir; dir=$(make_repo)
  printf 'CLAUDE.local.md\n.worktreeinclude\n' > "$SANDBOX/ignore"
  local code=0; run_in "$dir" >/dev/null 2>&1 || code=$?
  printf 'CLAUDE.local.md\n.worktreeinclude\nmy-notes/\n' > "$SANDBOX/ignore"
  assert_eq "not ignored: exit 1" "1" "$code"
  assert_eq "not ignored: nothing written" "no" "$([[ -e "$dir/my-notes" || -e "$dir/CLAUDE.local.md" || -e "$dir/.worktreeinclude" ]] && echo yes || echo no)"
  printf 'CLAUDE.local.md\n.worktreeinclude\nAGENTS.md\n' > "$SANDBOX/ignore"
  code=0; run_in "$dir" >/dev/null 2>&1 || code=$?
  printf 'CLAUDE.local.md\n.worktreeinclude\nmy-notes/\n' > "$SANDBOX/ignore"
  assert_eq "only AGENTS.md ignored, not the folder: exit 1" "1" "$code"
  assert_eq "only AGENTS.md ignored: nothing written" "no" "$([[ -e "$dir/my-notes" ]] && echo yes || echo no)"
}

test_worktreeinclude_excluded() {
  local dir; dir=$(make_repo)
  printf 'CLAUDE.local.md\nmy-notes/\n' > "$SANDBOX/ignore"
  local code=0; run_in "$dir" >/dev/null 2>&1 || code=$?
  run_in "$dir" >/dev/null 2>&1 || code=$?
  printf 'CLAUDE.local.md\n.worktreeinclude\nmy-notes/\n' > "$SANDBOX/ignore"
  assert_eq "exclude: setup and rerun succeed" "0" "$code"
  assert_eq "exclude: one line in .git/info/exclude" "1" "$(grep -c '^\.worktreeinclude$' "$dir/.git/info/exclude")"
  printf 'CLAUDE.local.md\nmy-notes/\n' > "$SANDBOX/ignore"
  assert_eq "exclude: the checkout stays clean" "" "$(git -C "$dir" status --porcelain)"
  printf 'CLAUDE.local.md\n.worktreeinclude\nmy-notes/\n' > "$SANDBOX/ignore"
}

commit_worktreeinclude() {
  printf '%s\n' "$2" > "$1/.worktreeinclude"
  git -C "$1" add -f .worktreeinclude
  git -C "$1" commit -q -m wt
}

test_tracked() {
  local dir; dir=$(make_repo)
  commit_worktreeinclude "$dir" x
  local code=0; run_in "$dir" >/dev/null 2>&1 || code=$?
  assert_eq "tracked .worktreeinclude without the line: exit 1" "1" "$code"
  dir=$(make_repo)
  commit_worktreeinclude "$dir" CLAUDE.local.md
  code=0; run_in "$dir" >/dev/null 2>&1 || code=$?
  assert_eq "tracked .worktreeinclude with the line: accepted" "0" "$code"
  assert_eq "tracked .worktreeinclude with the line: left unchanged" "" "$(git -C "$dir" status --porcelain)"
}

test_tolerant_match() {
  local dir; dir=$(make_repo)
  commit_worktreeinclude "$dir" /CLAUDE.local.md
  printf '@%s/my-notes/AGENTS.md \r\n' "$dir" > "$dir/CLAUDE.local.md"
  local code=0; run_in "$dir" >/dev/null 2>&1 || code=$?
  assert_eq "tolerant: a committed /CLAUDE.local.md is accepted" "0" "$code"
  assert_eq "tolerant: an import with CR and a space is not added again" "1" "$(grep -c my-notes "$dir/CLAUDE.local.md")"
}

test_agents_ignored_globally() {
  local dir; dir=$(make_repo)
  printf 'AGENTS.md\n' >> "$SANDBOX/ignore"
  run_in "$dir" >/dev/null 2>&1
  printf 'CLAUDE.local.md\n.worktreeinclude\nmy-notes/\n' > "$SANDBOX/ignore"
  assert_eq "AGENTS.md ignored globally: still committed" "AGENTS.md" "$(git -C "$dir/my-notes" ls-files)"
}

test_whitespace_path() {
  local dir; dir="$SANDBOX/with space"
  mkdir -p "$dir"
  git -C "$dir" init -q
  local code=0; run_in "$dir" >/dev/null 2>&1 || code=$?
  assert_eq "whitespace in the path: exit 1" "1" "$code"
}

test_commit_fails() {
  local dir; dir=$(make_repo)
  local code=0
  GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=true GIT_CONFIG_KEY_1=gpg.program GIT_CONFIG_VALUE_1=false \
    run_in "$dir" >/dev/null 2>&1 || code=$?
  assert_eq "failed first commit: exit 1" "1" "$code"
  run_in "$dir" >/dev/null 2>&1
  assert_eq "failed first commit: a rerun commits" "AGENTS.md" "$(git -C "$dir/my-notes" ls-files)"
}

test_worktree() {
  local dir; dir=$(make_repo)
  git -C "$dir" worktree add -q "$dir-wt" 2>/dev/null
  local code=0; run_in "$dir-wt" >/dev/null 2>&1 || code=$?
  assert_eq "in a worktree: exit 1" "1" "$code"
  assert_eq "in a worktree: nothing written" "no" "$([[ -e "$dir-wt/my-notes" ]] && echo yes || echo no)"
}

test_outside_git
test_setup
test_name_needed
test_existing_notes
test_not_ignored
test_worktreeinclude_excluded
test_tracked
test_tolerant_match
test_agents_ignored_globally
test_whitespace_path
test_commit_fails
test_worktree

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
