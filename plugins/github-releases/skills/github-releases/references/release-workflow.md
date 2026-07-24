# Release Workflow

Detailed per-phase instructions for executing a release. Use alongside the checklist in the main skill.

## Phase 1 — Prerequisites

Before proceeding verify all gates pass:

- `command -v gh` — GitHub CLI must be installed
- `gh auth status` — GitHub CLI must be authenticated
- `git status --porcelain` — working tree must be clean (no uncommitted changes)
- After `git fetch origin`, the local branch must be in sync with the remote default branch. Derive it — with a fallback for when `origin/HEAD` is not set locally (fresh `git init`, shallow/CI checkouts, new worktrees) — and diff against it:

  ```bash
  git fetch origin                                # without this the compare below
                                                  # reads a stale remote-tracking ref
                                                  # and passes on an out-of-date branch
  DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||')
  DEFAULT_BRANCH=${DEFAULT_BRANCH:-$(git remote show origin | sed -n 's/.*HEAD branch: //p')}
  git diff HEAD "origin/$DEFAULT_BRANCH" --stat   # expect no differences
  ```

See [quality-gates.md](quality-gates.md) for full gate details including CI status checks.

## Phase 2 — Read project release guide

Check for `docs/RELEASING.md`. If it exists:

- Read it in full before proceeding
- Replace all generic commands in the checklist with the project-specific commands defined there — never leave a generic placeholder when a real command is available

If no `docs/RELEASING.md` exists, use the generic commands from the checklist and note that a project guide is missing.

## Phase 3 — Quality gates

Run tests, build, and lint as defined in `docs/RELEASING.md` or as applicable to the project:

- All test suites must pass with zero failures
- Build must succeed
- Linter must pass (if applicable)

See [quality-gates.md](quality-gates.md) for the full checklist.

## Phase 4 — Documentation check

Verify version consistency across all project files that reference the version number. At this point the files still carry the *current* version — the pass criterion is that they all agree with each other, not that they match the release version.

See [documentation-checklist.md](documentation-checklist.md) for the full checklist.

## Phase 5 — Version bump

Determine the new version using semver rules, then update all version references in project files. Afterwards re-run the Phase 4 consistency check — now every reference must match the *release* version.

See [version-management.md](version-management.md) for semver rules and which files to update.

## Phase 6 — Commit and push the version bump

The tag must point at a commit that contains the version bump. Commit the Phase 5 changes and push them to the default branch before tagging:

```bash
# Re-derive in case this runs in a fresh shell (same fallback as Phase 1)
git remote set-head origin -a >/dev/null 2>&1   # refresh origin/HEAD; plain fetch does NOT,
                                                # so a renamed default branch stays stale here
DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-$(git remote show origin | sed -n 's/.*HEAD branch: //p')}

git add <bumped version files>
git commit -m "Bump version to <version>"
git push origin "$DEFAULT_BRANCH"

# Re-verify: clean tree, in sync with remote
git status --porcelain            # expect empty
git diff HEAD "origin/$DEFAULT_BRANCH" --stat   # expect no differences
```

If the project's `docs/RELEASING.md` prescribes its own commit/push procedure (e.g. a version-bump PR), follow that instead — but never proceed to Phase 7 with the bump uncommitted or unpushed. That path needs its own check: the bump lands via a server-side merge, so no local push updates the remote-tracking ref and the re-verify above would report a spurious difference. Fetch first, then confirm the merged bump is actually on the remote default branch:

```bash
git fetch origin
git diff "origin/$DEFAULT_BRANCH" -- <the version files>   # expect no differences
```

## Phase 7 — Create GitHub release

Write the release notes first, then create the release from them:

```bash
# Write release notes to a temp file — never create it inside the repo
NOTES=$(mktemp)
# ... write structured notes per release-notes-guide.md ...

# Tag the release
git tag v<version>
git push origin v<version>

# Create GitHub release
gh release create v<version> --title "v<version>" --notes-file "$NOTES"
rm "$NOTES"
```

See [release-notes-guide.md](release-notes-guide.md) for the required release notes format.

## Phase 8 — Post-release verification

```bash
# Confirm release is live
gh release view v<version>

# Verify the tag exists on remote
git ls-remote --tags origin v<version>
```

## Phase 9 — Cleanup

Run any post-release steps the project's `docs/RELEASING.md` specifies (announcements, version-file rollover). Skip if it defines none.

## Rules

- All quality gates must pass before proceeding past Phase 3
- Do not skip phases or proceed past a failure without explicit user confirmation
