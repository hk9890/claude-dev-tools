# Releasing

Project-specific release guide for the `github-releases` skill.

## Build

No build step — this repo contains only markdown and JSON files.

## Tests

Run `plugin-dev:plugin-validator` on every plugin. All must pass with zero errors before releasing.

See [TESTING.md](TESTING.md) for full validation details.

## Version files

Each plugin carries its own version in `.claude-plugin/plugin.json`. All plugins are released together under a single repo-level tag — bump every `"version"` field to the same new version.

```bash
find plugins -name plugin.json -path "*/.claude-plugin/*"
```

## Release steps

1. Bump `"version"` in all `plugin.json` files found above.
2. Commit: `git commit -m "Bump all plugins to vX.Y.Z"`
3. Create the GitHub release with `gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes`

## Verification

```bash
gh release view vX.Y.Z
```
