#!/usr/bin/env bash
# Set up the private layout of the standard in the git checkout of the current directory:
# hako-private/ with AGENTS.md and docs/ as a local git repository, the absolute import in
# CLAUDE.local.md, and CLAUDE.local.md in .worktreeinclude. Writes only what is absent,
# prints one line per file, and exits 1 without writing where a check fails.
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
  [[ -f "$file" ]] && awk -v want="$*" '
    BEGIN { n = split(want, w, " ") }
    { sub(/\r$/, ""); gsub(/^[ \t]+|[ \t]+$/, ""); for (i = 1; i <= n; i++) if ($0 == w[i]) found = 1 }
    END { exit !found }' "$file"
}

# A .worktreeinclude the repository commits already does the job where it lists CLAUDE.local.md.
include_done=no
if tracked .worktreeinclude; then
  has_line .worktreeinclude CLAUDE.local.md /CLAUDE.local.md \
    || fail ".worktreeinclude is tracked by this repository and does not list CLAUDE.local.md, so the private layout cannot add it"
  include_done=yes
fi

for path in CLAUDE.local.md .worktreeinclude hako-private/AGENTS.md; do
  [[ "$path" == .worktreeinclude && "$include_done" == yes ]] && continue
  tracked "$path" && fail "$path is tracked by this repository, so the private layout cannot write it"
  git check-ignore -q --no-index "$path" \
    || fail "git does not ignore $path here: add ${path%%/*} to your global gitignore (core.excludesFile), never to this repository's .gitignore"
done

import="@$top/hako-private/AGENTS.md"

mkdir -p hako-private/docs
if [[ -f hako-private/AGENTS.md ]]; then
  echo "kept    hako-private/AGENTS.md"
else
  cat > hako-private/AGENTS.md <<EOF
# AGENTS.md — $(basename "$top") private routing

The private delta to this repository's own docs, which load as they are.

## Use-case routing

Every route below is **mandatory, not advisory**. Load the document BEFORE the first action of that kind — loading it afterwards does not count, and no route becomes skippable because the task looks small.
EOF
  echo "created hako-private/AGENTS.md"
fi

if [[ -d hako-private/.git ]] && git -C hako-private rev-parse -q --verify HEAD >/dev/null 2>&1; then
  echo "kept    hako-private/.git"
else
  git -C hako-private init -q
  git -C hako-private add -f AGENTS.md
  git -C hako-private commit -q -m "Start the private docs" \
    || fail "the first commit in hako-private failed (see git's message above); fix it and run this again"
  echo "created hako-private/.git (local, no remote)"
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
