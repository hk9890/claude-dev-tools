# Releasing

Release process for this plugin marketplace. All plugins ship together under a single repo-level version tag.

Requires `gh` (authenticated), `jq`, and `python3` on PATH. Cut releases from a clean tree on an up-to-date `master`.

## Tests

There is no build step. Two gates, both required before releasing. They are the same two named in the [CHANGE-WORKFLOW.md pre-push checklist](CHANGE-WORKFLOW.md#pre-push-checklist), re-run here over the whole repo rather than over one change:

- **Test-Run** — `bash tests/run-all.sh` must pass. This is the gate that catches a botched bump: it includes `scripts/check-internal-consistency.py`, so a version mismatch between any `plugin.json` and `marketplace.json`, or more than one distinct version in the repo, fails it. The Script tests section in TESTING.md covers local test execution.
- **Plugin-Structure-Check** — Run `plugin-dev:plugin-validator` on **every** plugin, not just recently changed ones. All must pass with zero errors. This agent ships in the external `plugin-dev` plugin (see [TESTING.md](TESTING.md) for install instructions); skip this gate only if `plugin-dev` cannot be installed. (`plugin-dev:skill-reviewer` is a dev-time quality tool, not a release gate — see [CODING.md](CODING.md).)

The full sweep is the point of running Plugin-Structure-Check here: nothing tracks whether it was run on each merged PR, so the release is where a plugin that was never validated is caught.

See [TESTING.md](TESTING.md) for full validation details.

## Version files

Versions live in **two** places that must stay in sync:

1. Each plugin's own `.claude-plugin/plugin.json`
2. The matching entry in `.claude-plugin/marketplace.json` (what consumers see at install time)

All plugins are released together under a single repo-level tag — bump every version field to the same new version in both files.

```bash
jq -r '.metadata.version' .claude-plugin/marketplace.json   # the version being released from
find plugins -name plugin.json -path "*/.claude-plugin/*"   # every file to bump
```

### Choosing the number

One version covers all ten plugins, so it describes the release, not any one plugin. Take the largest change in it:

- **Minor** (`1.26.0` → `1.27.0`) — the default, and what every release from v1.21.0 to v1.26.0 has been. Any new skill, command, agent, or hook; any behaviour change to an existing one.
- **Patch** (`1.26.0` → `1.26.1`) — nothing but fixes and documentation. No new component and no changed behaviour, in any plugin.
- **Major** — a change that breaks how an installed plugin is invoked: a skill or command removed or renamed, or an argument contract changed incompatibly. Never used yet; a retirement with a documented successor has so far gone out as minor.

Lockstep is the cost of one tag: a patch-only fix in one plugin still bumps all ten. That is intended — the alternative is per-plugin tags, which the dependency rule in [CODING.md](CODING.md) already rules out.

## Release steps

1. Run Test-Run and Plugin-Structure-Check from the **Tests** section above — both must pass before releasing.
2. Bump `"version"` in all `plugin.json` files found above. If a `dependencies` entry ever carries a version constraint, a major bump has to widen it too — but none does: [CODING.md](CODING.md) forbids constraints in this marketplace.
3. Bump every `"version"` in `.claude-plugin/marketplace.json` to the same new version. Edit only the version lines — reformatting these files (e.g. piping them through `jq`) rewrites unrelated compact arrays and buries the bump in churn.
4. Verify they match: `bash tests/run-all.sh` will catch any version mismatch via `scripts/check-internal-consistency.py`. As a quick manual check: `diff <(jq -r '.plugins[] | "\(.name) \(.version)"' .claude-plugin/marketplace.json | sort) <(find plugins -name plugin.json -path "*/.claude-plugin/*" -exec jq -r '"\(.name) \(.version)"' {} \; | sort)` — should print nothing.
5. Commit the bump on a `chore/release-X.Y.Z` branch and merge it via PR: `git commit -m "Bump all plugins to vX.Y.Z"`. `master` is protected — see [CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md) — so the bump cannot be pushed to it directly.
6. Write the release notes per the **Release notes** section below, into a draft file in the gitignored scratch folder — not in the repo, where it would land in the bump commit.
7. Create the GitHub release from the merged bump commit: `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <draft> --target master`

Publish in the same sitting the bump PR merges — a merged bump with no tag breaks the tag invariant and leaves `marketplace.json` advertising a version that appears in no release. The tag and the version fields must carry the same version: `vX.Y.Z` tags the commit whose `plugin.json` files read `X.Y.Z`.

## Release notes

`github-releases:github-releases` carries the generic release flow. Local delta: its `release-notes-guide.md` structure does not apply here — use the structure below, and no emoji.

Write the notes around **what changed for users**, not around the list of PRs that changed it. A reader scanning the release should learn what they can now do, and what will behave differently, without opening a single PR.

Structure the notes as:

1. **A short lede** — one or two sentences naming the release's headline change. If a reader stops here, they should still know the most important thing.
2. **A section per user-facing feature**, titled by what the feature *does* (`Every Catppuccin flavour, generated from one source`), not by the component or PR that delivered it (`claude-catppuccin changes`). Explain what it enables and, where the design is non-obvious, why it works that way. Collapse several PRs into one section when they built one feature.
3. **Fixes** — lead with the user-visible symptom, then the cause. State the trade-off when a fix carries one.
4. **Changed behavior worth knowing** — argument-order changes, removed scripts, new defaults, anything that breaks a habit. Keep this section even when it is short; it is the first place a reader upgrading will look.
5. **Full Changelog** — the compare link, which is where the per-PR list belongs.

Draft in a file and publish with `--notes-file`; do not paste prose into `--notes` on the command line. Use `gh release create ... --generate-notes` only to produce a scratch list of merged PRs, then read those PRs' descriptions to write the real notes.

## Verification

The release is not done until all three of these agree. The middle one is the check that catches a merged bump whose release was never published:

```bash
git fetch --tags origin                       # gh release create writes the tag server-side only
gh release view vX.Y.Z                        # the release exists and its notes read as intended
git describe --tags --abbrev=0 origin/master  # prints vX.Y.Z, not the previous tag
jq -r '.metadata.version' .claude-plugin/marketplace.json   # prints X.Y.Z
```
