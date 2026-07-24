# Documentation Checklist

## Version Consistency

Check all files that reference the version number:

Take the authoritative file list from the project's own `docs/RELEASING.md` (see
[version-management.md](version-management.md)) rather than assuming a manifest name. A
hardcoded set silently matches nothing in projects that keep versions elsewhere — a plugin
marketplace with a dozen `plugin.json` files, for instance — and the check then passes on zero
evidence.

```bash
# Whatever files that project declares as carrying the version, plus a portable sweep
# of prose. -E for portability: \+ is a GNU extension in a basic regex.
grep -rnE "v?[0-9]+\.[0-9]+\.[0-9]+" <the version files RELEASING.md names> README.md docs/ 2>/dev/null
```

If that yields nothing, treat it as "not checked", not as "all agree".

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
