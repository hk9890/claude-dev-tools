# Releasing

Project-specific release guide for the `github-releases` skill.

## Build

No build step — this repo contains markdown, JSON, shell scripts, and plugin binaries, but none require compilation.

## Tests

Two gates, both required before releasing:

1. **In-repo script tests** — `bash tests/run-all.sh` must pass.
2. **Structural validation** — Run `plugin-dev:plugin-validator` on every plugin. All must pass with zero errors. This agent ships in the external `plugin-dev` plugin (see [TESTING.md](TESTING.md) for install instructions); skip this gate only if `plugin-dev` cannot be installed. (`plugin-dev:skill-reviewer` is a dev-time quality tool, not a release gate — see TESTING.md.)

See [TESTING.md](TESTING.md) for full validation details.

## Version files

Versions live in **two** places that must stay in sync:

1. Each plugin's own `.claude-plugin/plugin.json`
2. The matching entry in `.claude-plugin/marketplace.json` (what consumers see at install time)

All plugins are released together under a single repo-level tag — bump every version field to the same new version in both files.

```bash
find plugins -name plugin.json -path "*/.claude-plugin/*"
```

## Release steps

1. Bump `"version"` in all `plugin.json` files found above.
2. Bump every `"version"` in `.claude-plugin/marketplace.json` to the same new version.
3. Verify they match: `diff <(jq -r '.plugins[] | "\(.name) \(.version)"' .claude-plugin/marketplace.json | sort) <(find plugins -name plugin.json -path "*/.claude-plugin/*" -exec jq -r '"\(.name) \(.version)"' {} \; | sort)` — should print nothing.
4. Commit: `git commit -m "Bump all plugins to vX.Y.Z"`
5. Create the GitHub release with `gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes`

## Verification

```bash
gh release view vX.Y.Z
```
