# Troubleshooting

## gh CLI

### Not installed

```bash
# macOS
brew install gh

# Linux (Debian/Ubuntu)
sudo apt install gh

# Linux (Fedora)
sudo dnf install gh

# Other: https://cli.github.com/
```

### Not authenticated

```bash
gh auth login
# Follow prompts
```

### Rate limited

```bash
gh api rate_limit --jq '.rate'
# Wait for reset, or authenticate for higher limits
```

### 403 Forbidden

Missing write permissions. Ensure:
- Token has `repo` scope (check: `gh auth status`)
- You have push access to the repository
- Branch protection allows your role

### 404 Not Found

Repository doesn't exist or isn't accessible. Check:
- `git remote get-url origin` shows correct repo
- You have read access

## Git Issues

### Dirty working tree

```bash
git status
git stash  # Temporarily save changes
# Or: git add -A && git commit -m "pre-release cleanup"
```

### Tag already exists

```bash
gh release view v1.2.3                 # exits 0: the version is published
git ls-remote origin refs/tags/v1.2.3 'refs/tags/v1.2.3^{}'  # the remote tag's commit: the ^{} line, else the plain line
git rev-parse HEAD
```

- A release or a registry package exists for the version: never delete or move its tag. Bump to the next patch version and release that.
- No release, and the remote tag is on HEAD or absent: keep the local tag where it is on HEAD, else `git tag -f v1.2.3`. Then `git push origin v1.2.3` and `gh release create`.
- No release, and the remote tag is on another commit: delete it (`git push origin --delete v1.2.3`) only after the user confirms.

### Not on default branch

```bash
# Derive in-block: each Bash call is a fresh shell. Same sequence as release-workflow.md, Phase 1.
git remote set-head origin -a >/dev/null 2>&1
DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-$(git remote show origin | sed -n 's/.*HEAD branch: //p')}
[ -n "$DEFAULT_BRANCH" ] || { echo "FAIL: no default branch — origin/HEAD is unset and origin is unreachable; fix the remote first"; exit 1; }
git checkout "$DEFAULT_BRANCH"
git pull origin "$DEFAULT_BRANCH"
```

### Behind remote

```bash
# Derive in-block: each Bash call is a fresh shell. Same sequence as release-workflow.md, Phase 1.
git remote set-head origin -a >/dev/null 2>&1
DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-$(git remote show origin | sed -n 's/.*HEAD branch: //p')}
[ -n "$DEFAULT_BRANCH" ] || { echo "FAIL: no default branch — origin/HEAD is unset and origin is unreachable; fix the remote first"; exit 1; }
git pull --rebase origin "$DEFAULT_BRANCH"
```

## CI Issues

### CI not passing

```bash
gh run list --commit "$(git rev-parse HEAD)"
gh run view <run-id> --log-failed
```

Do NOT release with failing CI. Fix failures first.

### No CI configured

Manually run all quality gates:
1. Run tests locally
2. Run build locally
3. Verify on clean checkout if possible

## Release Issues

### Workflow not triggering

```bash
gh workflow list
cat .github/workflows/release.yml
grep "workflow_dispatch" .github/workflows/release.yml
```

### Release created but package not published

```bash
gh run list --workflow=release.yml --limit 1
gh run view <run-id> --log
```

Common causes:
- Missing authentication secrets
- Registry authentication failure
- Package name conflict
