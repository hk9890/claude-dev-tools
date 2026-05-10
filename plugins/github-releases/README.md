# github-releases

Language-agnostic GitHub release workflow with quality gates, semver, and release notes.

## Overview

This plugin provides a structured, checklist-driven GitHub release workflow that works with any project (Node, Python, Rust, Go, etc.). It enforces quality gates before release and guides you through version bumping, release note writing, and post-release verification.

## Commands

| Command | Description |
|---|---|
| `/release` | Create a new GitHub release — runs quality gates, version bump, and release creation |

## Prerequisites

- GitHub CLI installed and authenticated: `gh auth status`
- Clean working tree: `git status --porcelain` returns empty

## Usage

```
/release 1.2.0
```

Or without a version to let the skill determine the bump:

```
/release
```

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

To create or update this file:

```
/release setup
```

## Plugin Structure

```
github-releases/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   └── release.md
└── skills/
    └── github-releases/
        ├── SKILL.md
        └── references/     (release-workflow, quality-gates, version-management,
                              release-notes-guide, documentation-checklist,
                              troubleshooting, setup-modify-release-workflow)
```
