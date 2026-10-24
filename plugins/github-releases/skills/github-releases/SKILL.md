---
name: github-releases
description: "Create or publish a GitHub release, set up a project's release guide, or set up release CI."
user-invocable: true
disable-model-invocation: true
---

# GitHub Releases

Language-agnostic release workflow for GitHub projects.

## Use cases

This skill covers three release tasks — identify which one the user wants:

1. **Cut or publish a release** (default) — run the Prerequisites and Workflow below.
2. **Set up or update `docs/RELEASING.md`** — the project's release guide. Follow [setup-modify-release-workflow.md](references/setup-modify-release-workflow.md) instead of the release workflow.
3. **Set up release CI** — automate the mechanical *publish* half of a release in a CI pipeline. This is design guidance only; it does not write provider-specific pipeline files. Follow [ci-pipeline-guide.md](references/ci-pipeline-guide.md).

## Prerequisites (Phase 1)

Before cutting a release, run every check in [release-workflow.md — Phase 1](references/release-workflow.md). If any check fails, stop and guide the user through fixing it — see [troubleshooting.md](references/troubleshooting.md).

## Workflow

**1. Read the project release guide**

Check for `docs/RELEASING.md`. If it exists, read it before proceeding — it contains project-specific commands for tests, build, and version bumping, and those replace every generic command this skill suggests. Only fall back to generic commands when the project has no release guide.

**2. Create a release checklist**

Use TodoWrite to track progress through these phases:

- [ ] Quality gates: run tests, build, lint — all must pass with zero failures — [quality-gates.md](references/quality-gates.md)
- [ ] Documentation check: verify version consistency across all project files — [documentation-checklist.md](references/documentation-checklist.md)
- [ ] Version bump: update version in project files (package.json, Cargo.toml, etc.) — [version-management.md](references/version-management.md)
- [ ] Commit and push the version bump to the default branch; re-verify clean tree — [release-workflow.md](references/release-workflow.md)
- [ ] Write release notes: structured format — [release-notes-guide.md](references/release-notes-guide.md)
- [ ] Create GitHub release: tag, release body, assets — [release-workflow.md](references/release-workflow.md)
- [ ] Post-release verification: confirm release is live and correct — [release-workflow.md](references/release-workflow.md)
- [ ] Cleanup: post-release steps the project's `docs/RELEASING.md` specifies (announcements, version-file rollover); skip if it defines none

**3. Execute each phase in order**

Work through the checklist, marking items complete as you go, and read each phase's doc before starting that phase. Stop at a failed phase; continue past it only on explicit user confirmation. A failed quality gate holds the release until it is green, whatever the user confirms. When something goes wrong, [troubleshooting.md](references/troubleshooting.md) covers the common `gh` CLI, git, and CI failures.

