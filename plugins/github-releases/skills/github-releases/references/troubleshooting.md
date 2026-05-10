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
git tag -l "v1.2.*"  # Check existing
git tag -d v1.2.3  # Delete local
git push origin --delete v1.2.3  # Delete remote
```

### Not on default branch

```bash
git checkout main
git pull origin main
```

### Behind remote

```bash
git pull --rebase origin main
```

## CI Issues

### CI not passing

```bash
gh run list --limit 5
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
