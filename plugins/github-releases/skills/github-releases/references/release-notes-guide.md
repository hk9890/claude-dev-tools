# Release Notes Guide

## Structure

### Highlights (required)

3-5 key changes, emoji-prefixed for scanning:

```markdown
## Highlights

✅ Fixed all E2E test failures
🚀 2x faster query performance
📚 Complete API documentation
🔧 Improved error messages
⚠️ Dropped Node 16 support
```

Common emojis: ✅ fix, 🚀 performance, 📚 docs, 🔧 improvement, ⚠️ breaking,
🗑️ removal, 🐛 bugfix, ✨ new feature

### What's Changed (required)

```markdown
## What's Changed

### Added
- New `/api/users` endpoint (#123)

### Changed
- Improved caching strategy for 2x throughput

### Fixed
- Login timeout for slow connections (#456)

### Removed
- Deprecated `/api/v1/legacy` endpoint
```

### Breaking Changes (if applicable)

```markdown
## Breaking Changes

- Config key `oldName` renamed to `newName`
- Minimum version requirement changed

## Migration

1. Rename `oldName` to `newName` in config
2. Update to required version
```

## Tips

- Be specific: "Fixed login timeout after 30s" not "Fixed bug"
- Link issues: "Fixed crash (#123)"
- Show impact: "2x faster" not "performance improvement"
- Group related changes under one bullet
