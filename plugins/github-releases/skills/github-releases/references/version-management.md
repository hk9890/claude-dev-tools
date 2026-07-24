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
# Get last release tag — fall back to the latest git tag when the repo
# has no GitHub release yet
LAST_TAG=$(gh release view --json tagName --jq '.tagName' 2>/dev/null)
LAST_TAG=${LAST_TAG:-$(git describe --tags --abbrev=0 2>/dev/null)}

# List commits since last release. Guard on the empty case first: `git log ..HEAD`
# with an empty LAST_TAG exits 0 printing nothing, which reads as "no commits since
# the last release" when it actually means "no last release was found".
if [ -z "$LAST_TAG" ]; then
  echo "no release or tag found — this is a first release; analyze full history"
else
  git log "$LAST_TAG"..HEAD --oneline

  # Detailed diff
  gh api "repos/{owner}/{repo}/compare/$LAST_TAG...HEAD" \
    --jq '.commits[].commit.message'
fi
```

If `LAST_TAG` is still empty (first release: no GitHub release and no tags), analyze the full history instead: `git log --oneline` and start from the project's current declared version.

**Bump rules:**

- Any commit with "BREAKING" or removed/changed API → MAJOR
- Any "feat:" or new functionality → MINOR
- Only "fix:", "docs:", "chore:" → PATCH

## Version Files

If the project has a `docs/RELEASING.md`, it names the files that carry the version number. Otherwise search for them.

Common patterns: `package.json`, `pyproject.toml`, `Cargo.toml`, `VERSION`, `setup.py`

## Pre-release Versions

For pre-release testing: `X.Y.Z-alpha.1`, `X.Y.Z-beta.1`, `X.Y.Z-rc.1`

```bash
gh release create v2.0.0-rc.1 --prerelease --title "v2.0.0-rc.1" \
  --notes "Release candidate"
```
