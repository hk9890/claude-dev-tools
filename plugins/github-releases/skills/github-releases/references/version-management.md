# Version Management

## Semver Rules

`MAJOR.MINOR.PATCH`

| Bump | When | Examples |
| --------- | ---------------------------- | ------------------------------ |
| **MAJOR** | Breaking changes | Removed API, changed behavior |
| **MINOR** | New features (backward-compat) | New endpoint, option, command |
| **PATCH** | Bug fixes (backward-compat) | Fix crash, typo, regression |

## Analyzing Changes

```bash
# Get last release tag
LAST_TAG=$(gh release view --json tagName --jq '.tagName')

# List commits since last release
git log "$LAST_TAG"..HEAD --oneline

# Detailed diff
gh api "repos/:owner/:repo/compare/$LAST_TAG...HEAD" \
  --jq '.commits[].commit.message'
```

**Bump rules:**

- Any commit with "BREAKING" or removed/changed API → MAJOR
- Any "feat:" or new functionality → MINOR
- Only "fix:", "docs:", "chore:" → PATCH

## Version Files

Use `docs/RELEASING.md` to identify which files contain version numbers.

Common patterns: `package.json`, `pyproject.toml`, `Cargo.toml`, `VERSION`, `setup.py`

## Pre-release Versions

For pre-release testing: `X.Y.Z-alpha.1`, `X.Y.Z-beta.1`, `X.Y.Z-rc.1`

```bash
gh release create v2.0.0-rc.1 --prerelease --title "v2.0.0-rc.1" \
  --notes "Release candidate"
```
