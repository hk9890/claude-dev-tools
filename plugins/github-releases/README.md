# github-releases

Language-agnostic GitHub release workflow with quality gates, semver, and release notes.

## Overview

This plugin provides a structured, checklist-driven GitHub release workflow that works with any project (Node, Python, Rust, Go, etc.). It enforces quality gates before release and guides you through version bumping, release note writing, and post-release verification.

The plugin is **skill-driven** — there is no slash command. The `github-releases` skill triggers automatically from intent, or you can invoke it explicitly as `/github-releases`.

## Prerequisites

- GitHub CLI installed and authenticated: `gh auth status`
- Clean working tree: `git status --porcelain` returns empty

## Usage

Ask Claude to cut a release and the skill takes over:

```
cut a release
ship version 1.2.0
bump the version
```

Name a version to pin it (e.g. "release 1.2.0"); otherwise the skill determines the bump.

## Workflow Phases

1. **Prerequisites** — verify gh auth and clean working tree
2. **Quality gates** — tests, build, lint must all pass
3. **Documentation check** — version consistency across project files
4. **Version bump** — update version in project files
5. **Create GitHub release** — tag, release body, assets via gh CLI
6. **Release notes** — structured format (highlights, what's changed, breaking changes)
7. **Post-release verification** — confirm release is live and correct
8. **Cleanup** — post-release housekeeping

## Project-Specific Setup

Add a `docs/RELEASING.md` to your project with the actual commands for your build system, test runner, and version bump process. The skill reads this file before executing and replaces generic placeholders with your real commands.

To create or update this file, ask Claude to set up the release workflow (e.g. "set up our release workflow").

## Releasing via CI

This plugin drives a **local, human-driven** release flow. If you want to automate the mechanical *publish* half (build, sign, upload, create the release) in CI, see the `ci-pipeline-guide.md` reference — it covers the decide-vs-publish split, trigger models, security hardening, and how to find your own stack's tooling. It is **generic guidance, not a stack-specific pipeline**: the exact CI config is tech-, provider-, and registry-dependent and intentionally out of scope.

## Plugin structure

```
github-releases/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── github-releases/
        ├── SKILL.md
        └── references/     (release-workflow, quality-gates, version-management,
                              release-notes-guide, documentation-checklist,
                              troubleshooting, ci-pipeline-guide,
                              setup-modify-release-workflow)
```
