#!/usr/bin/env bash
# test-readonly-contract.sh — pin the reviewer read-only safety contract against drift.
#
# The adversarial-reviewer read-only contract is authored in TWO places that must stay
# byte-identical. Workflow scripts cannot import shared code, so the sentence is inlined in
# both rather than shared from one module:
#   - plugins/project-review/agents/project-reviewer.md                    (the fork-skill reviewer agent)
#   - plugins/project-review/skills/project-review-codebase/workflows/review-codebase.js  (workflow PERSONA)
# This test fails if either copy is missing or has drifted, so a tightening in one place can
# never silently skip the other — the exact failure that motivated it: the agent copy had lost
# the "never change git state" clause the workflow carried.
#
# NOT covered here: the docs workflow (review-docs.js). Its agents carry DELIBERATELY different
# contracts — the read-review agents forbid running commands at all, and the execution
# action-agent is a task-doer allowed to write one trace file — so they are not copies of this
# sentence and must not be forced to match it. A single copy has nothing to drift against.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"

# The canonical read-only contract. Any change to the reviewer's read-only rule must be made
# here AND verbatim in both files below — that three-way friction is deliberate: it forces a
# safety-rule change to be applied everywhere at once.
CONTRACT="Never create, edit, move, rename, or delete anything, and never change git state (no commit, branch, tag, stash, checkout, push); read-only inspection — reading, grep, git log/diff, running the test suite, walking the tree — is fine, but mutating the project is not."

FILES=(
  "plugins/project-review/agents/project-reviewer.md"
  "plugins/project-review/skills/project-review-codebase/workflows/review-codebase.js"
)

PASS=0
FAIL=0
ok()   { printf 'PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }

for rel in "${FILES[@]}"; do
  f="$REPO_ROOT/$rel"
  if [[ ! -f "$f" ]]; then
    fail "$rel — file not found"
    continue
  fi
  if grep -Fq "$CONTRACT" "$f"; then
    ok "$rel carries the canonical read-only contract verbatim"
  else
    fail "$rel — read-only contract missing or drifted from the canonical wording"
  fi
done

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
