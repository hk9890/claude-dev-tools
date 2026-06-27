---
name: github-releases
description: "Create or publish a GitHub release, set up a project's release guide, or set up release CI."
when_to_use: "Use when the user wants to create or publish a GitHub release, bump a version, set up a release workflow, or set up CI to automate the release publish. Triggers on 'cut a release', 'ship version X', 'bump the version', 'set up our release workflow', 'automate releases in CI'. Not for non-GitHub releases or general (non-release) CI/CD config."
---

# GitHub Releases

Language-agnostic release workflow for GitHub projects.

## Use cases

This skill covers three release tasks — identify which one the user wants:

1. **Cut or publish a release** (default) — run the Prerequisites and Workflow below.
2. **Set up or update `docs/RELEASING.md`** — the project's release guide. Follow [setup-modify-release-workflow.md](references/setup-modify-release-workflow.md) instead of the release workflow.
3. **Set up release CI** — automate the mechanical *publish* half of a release in a CI pipeline. This is design guidance only; it does not write provider-specific pipeline files. Follow [ci-pipeline-guide.md](references/ci-pipeline-guide.md).

The Prerequisites and Workflow below apply to use case 1.

## Prerequisites

Before starting, verify:
- `gh auth status` succeeds (GitHub CLI authenticated)
- `git status --porcelain` returns empty (clean working tree)
- You are on the correct branch and in sync with the remote default branch. After `git fetch origin`, derive the default branch — with a fallback for when `origin/HEAD` is not set locally (fresh `git init`, shallow/CI checkouts, new worktrees) — and diff against it:

  ```bash
  DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||')
  DEFAULT_BRANCH=${DEFAULT_BRANCH:-$(git remote show origin | sed -n 's/.*HEAD branch: //p')}
  git diff HEAD "origin/$DEFAULT_BRANCH" --stat   # expect no differences
  ```

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
- [ci-pipeline-guide.md](references/ci-pipeline-guide.md) — Automating the publish half in CI (decide-vs-publish, trigger models, hardening) — generic guidance, not stack-specific config
- [setup-modify-release-workflow.md](references/setup-modify-release-workflow.md) — Set up or update docs/RELEASING.md for this project
