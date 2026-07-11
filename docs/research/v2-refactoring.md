# v2 refactoring — plan and status

Living plan for the `v2` branch (PR #51, `v2` → `master`). Updated as work lands; this is
the single source of truth for the refactor, superseding the partial write-up in the PR
description. Last updated 2026-07-11.

**Landing plan:** the `challenge` plugin and this project-review rework land together on v2.
`project-auto-work` and any deeper review changes are a separate, later round.

## Goal

Reshape the marketplace so each plugin is named for what it does, with a coherent
membership rule. Two axes drive it: pull the project-agnostic "challenge anything" tools
out of the project-scoped review machinery, and split the overloaded `project-quality`
plugin into single-remit plugins.

## Target shape

| # | Plugin | Remit | Skills |
|---|--------|-------|--------|
| 1 | `challenge` | On-demand adversarial passes over anything, project-agnostic | grill, kiss, are-you-sure |
| 2 | `project-execute` | Shortcuts to a repo's own standard dev operations | project-exec-testing, project-exec-releasing, project-exec-monitoring, project-explain |
| 3 | `project-review` | Read-only reviews of a PR, a component, or the whole repo | project-review-all, -consistency, -docs, -structure, -tests |
| 4 | `project-auto-work` | Unattended, budget-bounded automatic work on a repo | project-auto-find-bug, project-auto-improve-test, … *(deferred — later round)* |

`project-explore` stays as-is (assisted, human-in-the-loop exploratory testing) alongside the
future `project-auto-work`; they are different interaction models, not a rename.

Unchanged and out of scope: `tasks`, `github-releases`, `html-visualization`,
`keep-awake-linux`, `claude-catppuccin`.

## Status

### Done and validated

- **Remove per-plugin README/RULES files.** Each duplicated its manifest and the canonical
  docs and had drifted. References repointed. *(commit `4667540`)*
- **Split `project-quality` → `project-execute` + `project-review`.** One plugin held two
  unrelated remits; git recorded 36 renames so history follows. *(commit `89d34e4`)*
- **Rename `grill` → `challenge`; move complexity review in as `kiss`.** The plugin is now
  the namespace for project-agnostic challenge tools. `project-review-complexity` left
  `project-review` and became the on-demand `challenge:kiss`. *(commit `73a7b02`)*
- **Simplify `challenge:grill`** to a plain interview prompt (adapted from
  mattpocock/skills, MIT); dropped the challenger agent and grill sheet. *(commit `44b0866`)*
- **Rework `challenge:kiss`** — review→analysis wording, inlined + book-anchored stance,
  decision-table routing, completion criterion. *(commit `a464f4d`)*
- **Cross-exclude grill and kiss** so "challenge this design" disambiguates. *(commit `e2a37b7`)*
- **`challenge` plugin validated** — plugin-validator zero errors, skill-reviewer sound,
  consistency gate green. Considered complete.
- **Drop cost rungs from the three standalone review skills** (consistency, structure,
  tests). Their `[low|medium|high|ultra]` argument and Cost paragraph are gone; they now run
  at the reviewer agent's default `medium`. The agent's dead `ultra` rung was removed
  (nothing reached it once standalone cost was gone; `project-review-all` already clamped it).
  `project-review-all` keeps its own cost — it still forwards an explicit rung to the
  reviewers it spawns, which is why the agent's Cost section stays.

The move surfaced two non-obvious fixes in `scripts/analyze-sessions.py`, both landed:
session attribution now derives the plugin from the aliased *skill* prefix (a split can't be
resolved from the plugin name alone), and the plugin-locating globs walk cache candidates
newest-first behind a marker file so a stale cached generation is never fed to reviewers.

### Considered and declined (kept as-is)

Weighed during the review-simplification pass and deliberately **not** done, to keep the
landing change small:

- **Remove `project-review-all`** — it's the biggest complexity sink (45% of the plugin), but
  it's the flagship "one prioritized list" workflow. Kept.
- **Merge `project-review-structure` into `-consistency`** — rejected: they are distinct axes
  (where files live vs. are we coherent), and merging re-introduces the multi-remit smell the
  `project-quality` split removed. Kept separate.
- **Remove `context: fork` from the review skills** — rejected for now: fork gives review
  independence, and dropping it would dissolve the in-context-vs-isolated boundary that
  justifies `challenge` and `project-review` being separate plugins. Revisit only with that
  consequence in view.

### Not started

- **`project-explore` → new `project-auto-work` plugin** — see below. Explicitly deferred to a
  later round; `project-explore` stays untouched and the new plugin is additive when built.

## project-auto-work — design notes (not started)

`project-explore` is **not** the same product renamed. It is assisted *exploratory testing*:
human-in-the-loop by design (Phase 2 is literally "one action, then ask"), built on taskmgr
from Phase 0 up, filing findings as tasks under an epic. `project-auto-work` is the opposite
interaction model: **unattended**, budget-bounded — "run for 20 minutes / 10 turns and report
back."

Decisions already taken (this session):

- It is a **new plugin**, not a `git mv`. `project-explore` either stays alongside it or is
  retired separately — supervised exploration and unsupervised grinding are different tools.
- The **taskmgr dependency is removed**. Since `project-explore` is taskmgr from the ground
  up, this is a full rewrite.
- Likely built on **workflows**, designed later.

Open questions to settle before building:

1. Does `project-explore` survive alongside `project-auto-work`, or get absorbed/retired?
2. Skill surface — `project-auto-find-bug`, `project-auto-improve-test`, and what else? Each
   is one unattended loop.
3. Budget/turn model — reuse harness primitives rather than building a runner:
   - `/loop` covers self-paced and fixed-interval runs.
   - `Workflow` exposes `budget.remaining()` (loop-until-budget) and the loop-until-dry
     pattern — "keep hunting until N rounds turn up nothing new," which is exactly
     `project-auto-find-bug`'s shape.
4. Naming: this would be its **third** name. `scripts/analyze-sessions.py` already maps
   `project-explore:explore-project` → `project-explore:project-explore`; a further rename
   needs another alias entry, and the analytics fixture test pins it.

## Before releasing v2

A release is a **whole-marketplace** action, not per-plugin (`docs/RELEASING.md`): all
plugins ship together under one repo-level tag cut from `master`. Consequences:

- Everything on `v2` ships together. Currently 8 commits ahead of `master`; version is still
  `1.22.0` and must be bumped in every `plugin.json` and in `marketplace.json` in lockstep.
- **Gate 2 evidence audit** (`scripts/check-gate2-evidence.sh`) will flag the v2 commits:
  they went straight to the branch without taskmgr tasks or `gate2:passed` comments. Reconcile
  before releasing.
- **PR #51's description is stale** — it documents only commits 1–3 and predates the
  `challenge` rename (still says "grill"). Refresh it from this file at release time.
- Cached `project-quality` / `grill` copies persist for anyone who installed v1.22.0; the
  marker-file guard in `analyze-sessions.py` is what stops them being mistaken for the new
  plugins.

## Full commit trail (v2 ahead of master)

```
e2a37b7 Cross-exclude challenge:grill and challenge:kiss
a464f4d Rework challenge:kiss — analysis wording, inline anchored principles
0b59772 Add writing-great-skills reference; tighten grill and are-you-sure
44b0866 Simplify challenge:grill to a plain interview prompt
73a7b02 Rename grill plugin to challenge; move complexity review into challenge:kiss
17b9828 Add dated research notes on extension authoring and external tooling
89d34e4 Split project-quality into project-execute and project-review
4667540 Remove per-plugin README and RULES files
```
