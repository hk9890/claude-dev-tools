---
name: github-releases
description: "Create or publish a GitHub release — runs quality gates, version bump, and release creation; also sets up a project's release guide."
when_to_use: "Use when the user wants to create or publish a GitHub release, asks about the release process, needs a version bump, wants to ship a new version, or wants to set up or update a project's release guide. Triggers on 'cut a release', 'ship version X', 'bump the version', 'create a GitHub release', 'set up our release workflow'. Does not apply to deployment pipelines, CI configuration, or non-GitHub release systems."
---

# GitHub Releases

Language-agnostic release workflow for GitHub projects.

## Prerequisites

Before starting, verify:
- `gh auth status` succeeds (GitHub CLI authenticated)
- `git status --porcelain` returns empty (clean working tree)
- You are on the correct branch and, after `git fetch origin`, `git diff HEAD "origin/$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|origin/||')" --stat` returns no differences (local branch in sync with the remote default branch — do not hardcode `main`; this derives it, e.g. `master`)

## Workflow

**1. Read the project release guide**

Check for `docs/RELEASING.md`. If it exists, read it before proceeding — it contains project-specific commands for tests, build, and version bumping. Do not use generic placeholders when project-specific commands are available.

**2. Create a release checklist**

Use TodoWrite to track progress through these phases:

- [ ] Quality gates: run tests, build, lint — all must pass with zero failures
- [ ] Documentation check: verify version consistency across all project files
- [ ] Version bump: update version in project files (package.json, Cargo.toml, etc.)
- [ ] Create GitHub release: tag, release body, assets
- [ ] Write release notes: structured format per release-notes-guide.md
- [ ] Post-release verification: confirm release is live and correct
- [ ] Cleanup: any post-release housekeeping

**3. Execute each phase in order**

Work through the checklist, marking items complete as you go. Reference the relevant doc for each phase (see References below). Do not proceed to the next phase if the current one fails.

**4. Filling project-specific steps**

Replace any generic commands with the actual commands from `docs/RELEASING.md`. Only proceed without a project guide if none exists — never leave generic placeholders when real commands are available.

## References

- [release-workflow.md](references/release-workflow.md) — Detailed process for each phase
- [quality-gates.md](references/quality-gates.md) — Pre-release validation gates
- [documentation-checklist.md](references/documentation-checklist.md) — Version consistency checks
- [version-management.md](references/version-management.md) — Semver rules and version bump analysis
- [release-notes-guide.md](references/release-notes-guide.md) — Structured release notes format
- [troubleshooting.md](references/troubleshooting.md) — Common gh CLI, git, and CI issues
- [setup-modify-release-workflow.md](references/setup-modify-release-workflow.md) — Set up or update docs/RELEASING.md for this project
