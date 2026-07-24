# Quality Gates

Pre-release validation checklist.

## Gate 1: Clean Working Tree

```bash
# Tracked changes. Use status --porcelain, not `git diff-index --quiet`: a merely stale
# index (a file touched but not modified) makes diff-index report a difference that
# is not one, failing the gate on a clean tree.
[ -z "$(git status --porcelain --untracked-files=no)" ] || echo "FAIL: uncommitted changes"

# Untracked files — informational, not a failure: build output and local scratch are
# normal. Read the list and decide whether anything in it belongs in the release.
git ls-files --others --exclude-standard
```

Then confirm you are **on** the default branch, not merely holding identical content — the
sync check below compares trees, so it passes from any branch whose content matches:

```bash
# DEFAULT_BRANCH is derived in release-workflow.md — Phase 1; reuse that derivation.
[ "$(git rev-parse --abbrev-ref HEAD)" = "$DEFAULT_BRANCH" ] || echo "FAIL: not on $DEFAULT_BRANCH"
```

Then verify sync with the remote default branch — derive `DEFAULT_BRANCH` and diff as in [release-workflow.md — Phase 1](release-workflow.md).

## Gate 2: Tests Pass

Run the project's full test suite — unit, integration, and E2E tests — with the commands established in Phase 2 of [release-workflow.md](release-workflow.md). If unsure, ask the user.

All test suites MUST pass. Do not skip any.

## Gate 3: Build Succeeds

Build the project with the build command established in Phase 2 of [release-workflow.md](release-workflow.md). If unsure, ask the user.

## Gate 4: Lint Passes

Run the project's linter with the command established in Phase 2 of [release-workflow.md](release-workflow.md). If the project configures no linter, record that and move on — but check before concluding it has none, since a linter often gates CI without being named in the release docs.

## Gate 5: CI Status

```bash
# Check CI status of latest commit
gh run list --limit 5
gh run view <run-id>

# Or check PR checks
gh pr checks
```

All CI checks MUST be green. Do not release with failing CI.
