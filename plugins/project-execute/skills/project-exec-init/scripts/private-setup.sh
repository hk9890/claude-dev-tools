#!/usr/bin/env bash
# Set up the private layout of the standard in the git checkout of the current directory:
# <folder>/ with AGENTS.md and docs/ as a local git repository, the absolute import in
# CLAUDE.local.md, and CLAUDE.local.md in .worktreeinclude. Writes only what is absent,
# prints one line per file, and exits 1 without writing where a check fails.
#
# Usage: private-setup.sh [<folder>]
# With no folder, the folder of the import CLAUDE.local.md already holds; where it holds
# none, exit 2 with no write, for the caller to ask the user for a name.
set -euo pipefail

fail() { printf 'error: %s\n' "$1" >&2; exit 1; }

top=$(git rev-parse --show-toplevel 2>/dev/null) || fail "not inside a git checkout"
cd "$top"
[[ "$(git rev-parse --path-format=absolute --git-dir)" == "$(git rev-parse --path-format=absolute --git-common-dir)" ]] \
  || fail "$top is a git worktree: run this in the main checkout, which the import must name"

[[ "$top" =~ [[:space:]] ]] && fail "the checkout path \"$top\" holds whitespace, which ends an @-import"

tracked() { git ls-files --error-unmatch "$1" >/dev/null 2>&1; }
# Whether file $1 holds one of the lines after it, ignoring surrounding whitespace and a CR.
has_line() {
  local file=$1; shift
  [[ -f "$file" ]] && WANT="$*" awk '
    BEGIN { n = split(ENVIRON["WANT"], w, " ") }
    { sub(/\r$/, ""); gsub(/^[ \t]+|[ \t]+$/, ""); for (i = 1; i <= n; i++) if ($0 == w[i]) found = 1 }
    END { exit !found }' "$file"
}
# The folder of each import of <top>/<folder>/AGENTS.md that CLAUDE.local.md holds.
imported_folders() {
  [[ -f CLAUDE.local.md ]] || return 0
  # Through the environment: gawk reads a -v value of the form @/…/ as a regex constant.
  PREFIX="@$top/" awk '
    BEGIN { pre = ENVIRON["PREFIX"] }
    { sub(/\r$/, ""); gsub(/^[ \t]+|[ \t]+$/, "") }
    index($0, pre) == 1 { rest = substr($0, length(pre) + 1); if (rest ~ /^[^\/]+\/AGENTS\.md$/) { sub(/\/AGENTS\.md$/, "", rest); print rest } }
  ' CLAUDE.local.md
}

existing=$(imported_folders | head -n 1)
folder=${1:-$existing}
if [[ -z "$folder" ]]; then
  echo "no private folder yet: name one, as private-setup.sh <folder>" >&2
  exit 2
fi
[[ "$folder" =~ ^[A-Za-z0-9._-]+$ && "$folder" != . && "$folder" != .. && "$folder" != .git ]] \
  || fail "\"$folder\" is no folder name: use one path segment of letters, digits, . _ -"
[[ -z "$existing" || "$existing" == "$folder" ]] \
  || fail "CLAUDE.local.md already imports the private folder $existing, not $folder"

# A .worktreeinclude the repository commits already does the job where it lists CLAUDE.local.md.
include_done=no
if tracked .worktreeinclude; then
  has_line .worktreeinclude CLAUDE.local.md /CLAUDE.local.md \
    || fail ".worktreeinclude is tracked by this repository and does not list CLAUDE.local.md, so the private layout cannot add it"
  include_done=yes
fi

for path in CLAUDE.local.md "$folder/AGENTS.md"; do
  tracked "$path" && fail "$path is tracked by this repository, so the private layout cannot write it"
  git check-ignore -q --no-index "$path" \
    || fail "git does not ignore $path here: add ${path%%/*}$([[ "$path" == */* ]] && echo /) to your global gitignore (core.excludesFile), never to this repository's .gitignore"
done

if [[ "$include_done" == no ]] && ! git check-ignore -q --no-index .worktreeinclude; then
  exclude=$(git rev-parse --git-path info/exclude)
  mkdir -p "$(dirname "$exclude")"
  if [[ -s "$exclude" && -n "$(tail -c 1 "$exclude")" ]]; then echo >> "$exclude"; fi
  printf '.worktreeinclude\n' >> "$exclude"
  git check-ignore -q --no-index .worktreeinclude \
    || fail "this repository's .gitignore keeps .worktreeinclude visible to git, so the private layout cannot add it"
  echo "added   .worktreeinclude to $exclude"
fi

import="@$top/$folder/AGENTS.md"

mkdir -p "$folder/docs"
if [[ -f "$folder/AGENTS.md" ]]; then
  echo "kept    $folder/AGENTS.md"
else
  # The "Every route below" line copies the one in writing-project-docs' examples/AGENTS.md
  # (instruction-writing): a change to one is a change to both.
  cat > "$folder/AGENTS.md" <<EOF
# AGENTS.md — $(basename "$top") private routing

The private delta to this repository's own docs, which load as they are.

## Use-case routing

Every route below is **mandatory, not advisory**. Load the document BEFORE the first action of that kind — loading it afterwards does not count, and no route becomes skippable because the task looks small.
EOF
  echo "created $folder/AGENTS.md"
fi

if [[ -d "$folder/.git" ]] && git -C "$folder" rev-parse -q --verify HEAD >/dev/null 2>&1; then
  echo "kept    $folder/.git"
else
  git -C "$folder" init -q
  git -C "$folder" add -f AGENTS.md
  git -C "$folder" commit -q -m "Start the private docs" \
    || fail "the first commit in $folder failed (see git's message above); fix it and run this again"
  echo "created $folder/.git (local, no remote)"
fi

if [[ ! -f CLAUDE.local.md ]]; then
  printf '%s\n' "$import" > CLAUDE.local.md
  echo "created CLAUDE.local.md"
elif has_line CLAUDE.local.md "$import"; then
  echo "kept    CLAUDE.local.md"
else
  printf '\n%s\n' "$import" >> CLAUDE.local.md
  echo "added   the import to CLAUDE.local.md"
fi

if [[ "$include_done" == yes ]] || has_line .worktreeinclude CLAUDE.local.md /CLAUDE.local.md; then
  echo "kept    .worktreeinclude"
else
  if [[ -s .worktreeinclude && -n "$(tail -c 1 .worktreeinclude)" ]]; then echo >> .worktreeinclude; fi
  printf 'CLAUDE.local.md\n' >> .worktreeinclude
  echo "added   CLAUDE.local.md to .worktreeinclude"
fi
echo "folder  $folder"
