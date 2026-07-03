# Documentation Checklist

## Version Consistency

Check all files that reference the version number:

```bash
# Find version references
grep -r "version" package.json setup.py pyproject.toml Cargo.toml 2>/dev/null
grep -rn "v[0-9]\+\.[0-9]\+\.[0-9]\+" README.md docs/ 2>/dev/null
```

This check runs twice with different pass criteria:

- **Pre-bump (Phase 4)**: all version references MUST agree with each other on the *current* version — no stragglers left behind by a previous release. The release version does not exist in the files yet.
- **Post-bump (after Phase 5)**: re-run the same grep; all version references MUST now match the *release* version.

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
