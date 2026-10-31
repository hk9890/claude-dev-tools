# Releasing

All plugins ship together under a single repo-level version tag. There is no build step.

Requires `gh` (authenticated), `jq`, and `python3` on PATH. Cut releases from a clean tree on an up-to-date `master`.

## Gates

Re-run two of the [CHANGE-WORKFLOW.md pre-push checklist](CHANGE-WORKFLOW.md#pre-push-checklist) gates over the whole repo, not just the release commit. Docs-Route-Check and Shell-Lint do not apply: a bump changes only `"version"` lines in JSON files.

- **Test-Run** — `bash tests/run-all.sh`. It runs `scripts/check-internal-consistency.py` over the live repo.
- **Plugin-Structure-Check** — `plugin-dev:plugin-validator` over **every** plugin, not just recently changed ones, with zero errors. The full sweep is the point: nothing tracks whether it ran on each merged PR, so the release is where a never-validated plugin is caught. Skip it only if `plugin-dev` cannot be installed.

## Choosing the number

One version covers every plugin, so it describes the release rather than any one plugin. Take the largest change in it:

- **Minor** (`1.26.0` → `1.27.0`) — the default. Any new skill, command, agent, or hook; any behaviour change to an existing one.
- **Patch** (`1.26.0` → `1.26.1`) — fixes and documentation only, in every plugin.
- **Major** — a break in how an installed plugin is invoked: a skill or command removed or renamed, or an argument contract changed incompatibly. Never used yet; a retirement with a documented successor has so far gone out as minor.

Lockstep is the cost of one tag: a patch-only fix in one plugin bumps them all. The alternative is per-plugin tags, which the dependency rule in [CODING.md](CODING.md) already rules out.

## Release steps

Versions live in **two** places that must stay in sync: each plugin's own `.claude-plugin/plugin.json`, and the matching entry in `.claude-plugin/marketplace.json` (what consumers see at install time).

```bash
jq -r '.metadata.version' .claude-plugin/marketplace.json   # the version being released from
find plugins -name plugin.json -path "*/.claude-plugin/*"   # every file to bump
```

1. Run the two gates above.
2. Bump `"version"` in every `plugin.json` found above to the same new version.
3. Bump every `"version"` in `.claude-plugin/marketplace.json` to match. Edit only the version lines: piping these files through `jq` rewrites unrelated compact arrays and buries the bump in churn.
4. Verify — prints nothing when they match: `diff <(jq -r '.plugins[] | "\(.name) \(.version)"' .claude-plugin/marketplace.json | sort) <(find plugins -name plugin.json -path "*/.claude-plugin/*" -exec jq -r '"\(.name) \(.version)"' {} \; | sort)`. Then run `mise run check-consistency`: the diff misses a plugin left at the old version in both files and an unbumped `metadata.version`, and the checker fails on more than one distinct version.
5. Commit as `Bump all plugins to vX.Y.Z` on a `chore/release-X.Y.Z` branch and merge via PR — `master` is protected ([CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md)), so the bump cannot be pushed to it directly.
6. Draft the release notes (below) in `hako-private/release-notes-vX.Y.Z.md`. The maintainer's global gitignore covers `hako-private/`; never add it to the repo `.gitignore`. A draft at a tracked path lands in the bump commit.
7. Create the release from the merged bump commit: `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file hako-private/release-notes-vX.Y.Z.md --target master`

Publish in the same sitting the bump PR merges — a merged bump with no tag leaves `marketplace.json` advertising a version that appears in no release. `vX.Y.Z` must tag the commit whose `plugin.json` files read `X.Y.Z`.

## Release notes

The user-only `/github-releases:github-releases` carries the generic release flow; the Skill tool cannot load it. **Local delta:** its `release-notes-guide.md` structure does not apply — use the structure below, and no emoji.

Write around **what changed for users**, not the PRs that changed it: a reader scanning the release should learn what they can now do, and what will behave differently, without opening a single PR.

1. **Lede** — one or two sentences naming the headline change, enough for a reader who stops there.
2. **A section per user-facing feature**, titled by what it *does* (`Every Catppuccin flavour, generated from one source`), not by what delivered it (`catppuccin-themes changes`). Say what it enables, and why it works that way where the design is non-obvious. Collapse several PRs into one section when they built one feature.
3. **Fixes** — user-visible symptom first, then the cause, plus the trade-off where a fix carries one.
4. **Changed behavior worth knowing** — argument-order changes, removed scripts, new defaults, anything that breaks a habit. Keep the section even when short; an upgrading reader looks here first. A renamed plugin goes here with its new install name; where it ships a theme, tell users to select the theme again with `/theme`, because the stored `custom:<plugin>:<theme>` id is not migrated.
5. **Full Changelog** — the compare link, which is where the per-PR list belongs.

Publish with `--notes-file` from a drafted file, never `--notes`. Use `--generate-notes` only for a scratch list of merged PRs, then read those PRs to write the real notes.

## Verification

The release is not done until all four agree; the middle two catch a merged bump whose release was never published:

```bash
git fetch --tags origin                       # gh release create writes the tag server-side only
gh release view vX.Y.Z                        # the release exists and its notes read as intended
git describe --tags --abbrev=0 origin/master  # prints vX.Y.Z, not the previous tag
jq -r '.metadata.version' .claude-plugin/marketplace.json   # prints X.Y.Z
```
