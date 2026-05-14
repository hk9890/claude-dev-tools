# Release Workflow

Detailed per-phase instructions for executing a release. Use alongside the checklist in the main skill.

## Phase 1 — Prerequisites

Before proceeding verify all gates pass:

- `gh auth status` — GitHub CLI must be authenticated
- `git status --porcelain` — working tree must be clean (no uncommitted changes)
- `git fetch origin && git diff HEAD origin/main --stat` — local branch must be in sync with remote

See [quality-gates.md](quality-gates.md) for full gate details including CI status checks.

## Phase 2 — Read project release guide

Check for `docs/RELEASING.md`. If it exists:

- Read it in full before proceeding
- Replace all generic commands in the checklist with the project-specific commands defined there
- Never leave generic placeholder commands when real commands are available

If no `docs/RELEASING.md` exists, use the generic commands from the checklist and note that a project guide is missing.

## Phase 3 — Quality gates

Run tests, build, and lint as defined in `docs/RELEASING.md` or as applicable to the project:

- All test suites must pass with zero failures
- Build must succeed
- Linter must pass (if applicable)

See [quality-gates.md](quality-gates.md) for the full checklist.

## Phase 4 — Documentation check

Verify version consistency across all project files that reference the version number.

See [documentation-checklist.md](documentation-checklist.md) for the full checklist.

## Phase 5 — Version bump

Determine the new version using semver rules, then update all version references in project files.

See [version-management.md](version-management.md) for semver rules and which files to update.

## Phase 6 — Create GitHub release

```bash
# Tag the release
git tag v<version>
git push origin v<version>

# Create GitHub release with release notes
gh release create v<version> --title "v<version>" --notes-file <release-notes-file>
```

See [release-notes-guide.md](release-notes-guide.md) for the required release notes format.

## Phase 7 — Post-release verification

```bash
# Confirm release is live
gh release view v<version>

# Verify the tag exists on remote
git ls-remote --tags origin v<version>
```

## Rules

- All quality gates must pass before proceeding past Phase 3
- Never leave generic placeholder commands — always use project-specific commands from `docs/RELEASING.md`
- Do not skip phases or proceed past a failure without explicit user confirmation
