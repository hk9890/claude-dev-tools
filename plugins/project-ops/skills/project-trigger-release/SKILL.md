---
name: project-trigger-release
description: "Cut a new release — discovers and loads any installed release skills, follows docs/RELEASING.md, then runs the release process and reports the outcome."
user-invocable: true
disable-model-invocation: true
---

Cut a new release for the project. Do not assume anything about how this project releases — derive everything from the two sources below.

## 1. Gather guidance

- Look for installed release skills and load any that apply (for example, a GitHub releases skill). Treat them as the source of truth for how releases are cut here.
- Read `docs/RELEASING.md` and any RELEASING routing in `AGENTS.md` for the repo-specific release constraints, version scheme, quality gates, and entrypoints.

## 2. If there is no guidance

If **no** release skill applies **and** `docs/RELEASING.md` does not exist (or has no real release guidance), do not guess the version scheme or invent a release process.

Instead, stop and tell the user that there is no release guidance for this project, and that they should create `docs/RELEASING.md` describing how releases are cut (the `project-docs` plugin can scaffold it). Ask whether they want to proceed anyway with whatever you can infer, but do not release anything until they confirm.

## 3. Run the release

Optional argument (advisory only — version, release type, or scope hint):

$ARGUMENTS

- Follow the release process exactly as the skills and `docs/RELEASING.md` define it — no assumed version scheme, gates, or steps.
- If the release type or version bump is ambiguous (for example major vs. minor vs. patch, or several releasable targets), ask the user what to release before proceeding.
- If an argument is given, use it to resolve that ambiguity.
- Run the required quality gates before publishing; do not skip them.
- Confirm with the user before any outward-facing or hard-to-reverse step (pushing a tag, publishing the release, uploading artifacts).

## 4. Report

Report what was released: version, what changed, quality-gate results, and the published location.
