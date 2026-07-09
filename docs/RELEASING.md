# Releasing

Release process for this plugin marketplace. All plugins ship together under a single repo-level version tag.

## Tests

There is no build step — the repo is markdown, JSON, and shell scripts, none of which compile. Three gates, all required before releasing:

1. **In-repo script tests** — `bash tests/run-all.sh` must pass. This gate includes `scripts/check-internal-consistency.py`, which mechanically enforces section-level cross-reference integrity, version mirror, description mirror between `plugin.json` and `marketplace.json`, and single-version uniformity (every plugin entry and `marketplace.json` `metadata.version` carry the same version — the lockstep this doc requires). The Script tests section in TESTING.md covers local test execution.
2. **Structural validation** — Run `plugin-dev:plugin-validator` on every plugin. All must pass with zero errors. This agent ships in the external `plugin-dev` plugin (see [TESTING.md](TESTING.md) for install instructions); skip this gate only if `plugin-dev` cannot be installed. (`plugin-dev:skill-reviewer` is a dev-time quality tool, not a release gate — see TESTING.md.)
3. **Gate 2 evidence audit** — Run `bash scripts/check-gate2-evidence.sh` to verify that every PR merged since the previous release tag whose commits touched validator-checked plugin surfaces (`.claude-plugin/plugin.json`, `agents/`, `skills/`, `commands/`, or `hooks/`) has a `gate2:passed` or `gate2:n/a` comment on its linked taskmgr task. The script exits 1 and prints the offending PR(s) if any evidence is missing. This is the release-time enforcement of the process gate described in [CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md). Block the release if this audit fails; add the missing `gate2:passed` or `gate2:n/a` comment to the task and re-run to clear.

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

## Release notes

Write the notes around **what changed for users**, not around the list of PRs that changed it. `--generate-notes` produces a flat bullet per merged PR — useful as raw material for finding what landed, never as the published notes. A reader scanning the release should learn what they can now do, and what will behave differently, without opening a single PR.

Structure the notes as:

1. **A short lede** — one or two sentences naming the release's headline change. If a reader stops here, they should still know the most important thing.
2. **A section per user-facing feature**, titled by what the feature *does* (`Every Catppuccin flavour, generated from one source`), not by the component or PR that delivered it (`claude-catppuccin changes`). Explain what it enables and, where the design is non-obvious, why it works that way. Collapse several PRs into one section when they built one feature.
3. **Fixes** — lead with the user-visible symptom, then the cause. State the trade-off when a fix carries one.
4. **Changed behavior worth knowing** — argument-order changes, removed scripts, new defaults, anything that breaks a habit. Keep this section even when it is short; it is the first place a reader upgrading will look.
5. **Full Changelog** — the compare link, which is where the per-PR list belongs.

Rules of thumb:

- Omit sections that have no content. A release with no behavior changes drops that heading rather than writing "none".
- Purely internal work (CI, refactors, test scaffolding) gets at most one short section near the end, or no mention at all. Dependabot bumps are never their own bullet.
- Name trade-offs and known limitations explicitly. A release note that only markets is a release note nobody trusts twice.
- Draft in a file and publish with `--notes-file`; do not paste prose into `--notes` on the command line.

Use `gh release create ... --generate-notes` only to produce a scratch list of merged PRs, then read those PRs' descriptions to write the real notes.

## Release steps

1. Run the three gates in the **Tests** section above — all must pass before releasing.
2. Bump `"version"` in all `plugin.json` files found above.
3. Bump every `"version"` in `.claude-plugin/marketplace.json` to the same new version. Edit only the version lines — reformatting these files (e.g. piping them through `jq`) rewrites unrelated compact arrays and buries the bump in churn.
4. Verify they match: `bash tests/run-all.sh` will catch any version mismatch via `scripts/check-internal-consistency.py`. As a quick manual check: `diff <(jq -r '.plugins[] | "\(.name) \(.version)"' .claude-plugin/marketplace.json | sort) <(find plugins -name plugin.json -path "*/.claude-plugin/*" -exec jq -r '"\(.name) \(.version)"' {} \; | sort)` — should print nothing.
5. Commit the bump on a `chore/release-X.Y.Z` branch and merge it via PR: `git commit -m "Bump all plugins to vX.Y.Z"`. `master` is protected — see [CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md) — so the bump cannot be pushed to it directly.
6. Write the release notes per the **Release notes** section above, into a draft file.
7. Create the GitHub release from the merged bump commit: `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <draft> --target master`

The tag and the version fields must carry the same version — `vX.Y.Z` tags the commit whose `plugin.json` files read `X.Y.Z`.

## Verification

```bash
gh release view vX.Y.Z
```
