# Quality Gates

Pre-release validation checklist.

## Gate 1: Clean Working Tree

```bash
# Uncommitted changes
git diff-index --quiet HEAD -- || echo "FAIL: uncommitted changes"

# Untracked files
git ls-files --others --exclude-standard | head -5

# Up to date with remote
git fetch origin && git diff HEAD origin/main --stat
```

## Gate 2: Tests Pass

Run the project's full test suite — unit, integration, and E2E tests.

Use the project-specific release guide (`docs/RELEASING.md`) to identify test commands. If unsure, ask the user.

All test suites MUST pass. Do not skip any.

## Gate 3: Build Succeeds

Build the project using its standard build tooling.

Use the project-specific release guide (`docs/RELEASING.md`) to identify the build command. If unsure, ask the user.

## Gate 4: CI Status

```bash
# Check CI status of latest commit
gh run list --limit 5
gh run view <run-id>

# Or check PR checks
gh pr checks
```

All CI checks MUST be green. Do not release with failing CI.
