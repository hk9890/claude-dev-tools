# Releasing

Release process for this plugin marketplace. All plugins ship together under a single repo-level version tag.

## Build

No build step — this repo contains markdown, JSON, shell scripts, and plugin binaries, but none require compilation.

## Tests

Three gates, all required before releasing:

1. **In-repo script tests** — `bash tests/run-all.sh` must pass. This gate includes `scripts/check-internal-consistency.py`, which mechanically enforces both section-level cross-reference integrity and version mirror consistency between `plugin.json` and `marketplace.json`. The Script tests section in TESTING.md covers local test execution.
2. **Structural validation** — Run `plugin-dev:plugin-validator` on every plugin. All must pass with zero errors. This agent ships in the external `plugin-dev` plugin (see [TESTING.md](TESTING.md) for install instructions); skip this gate only if `plugin-dev` cannot be installed. (`plugin-dev:skill-reviewer` is a dev-time quality tool, not a release gate — see TESTING.md.)
3. **Gate 2 evidence audit** — Run `bash scripts/check-gate2-evidence.sh` to verify that every PR merged since the previous release tag whose commits touched validator-checked plugin surfaces (`.claude-plugin/plugin.json`, `agents/`, `skills/`, `commands/`, or `hooks/`) has a `gate2:passed` or `gate2:n/a` comment on its linked beads ticket. The script exits 1 and prints the offending PR(s) if any evidence is missing. This is the release-time enforcement of the process gate described in [CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md). Block the release if this audit fails; add the missing `gate2:passed` or `gate2:n/a` comment to the bead and re-run to clear.

   ```bash
   bash scripts/check-gate2-evidence.sh [<previous-release-tag>]
   # defaults to the most recent annotated tag
   ```

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
3. Verify they match: `bash tests/run-all.sh` will catch any version mismatch via `scripts/check-internal-consistency.py`. As a quick manual check: `diff <(jq -r '.plugins[] | "\(.name) \(.version)"' .claude-plugin/marketplace.json | sort) <(find plugins -name plugin.json -path "*/.claude-plugin/*" -exec jq -r '"\(.name) \(.version)"' {} \; | sort)` — should print nothing.
4. Commit: `git commit -m "Bump all plugins to vX.Y.Z"`
5. Create the GitHub release with `gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes`

## Verification

```bash
gh release view vX.Y.Z
```
