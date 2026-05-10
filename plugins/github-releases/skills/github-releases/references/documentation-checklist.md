# Documentation Checklist

**YOU MUST follow the rules in the documentation skill if available.**

Load a skill that fixes and validates documentation to automate these checks. Only use manual validation if no skill is available.

## Version Consistency

Check all files that reference the version number:

```bash
# Find version references
grep -r "version" package.json setup.py pyproject.toml Cargo.toml 2>/dev/null
grep -rn "v[0-9]\+\.[0-9]\+\.[0-9]\+" README.md docs/ 2>/dev/null
```

All version references MUST match the release version.

## README

- [ ] Installation instructions reference current version
- [ ] Code examples still work
- [ ] Links resolve (no 404s)
- [ ] Badges show correct version
- [ ] Feature list matches current state

## Breaking Changes

If any breaking changes:

- [ ] Documented in CHANGELOG with `### Breaking Changes`
- [ ] Migration guide provided (inline or linked)
- [ ] Deprecation warnings added in previous release (if applicable)
