---
name: project-trigger-release
description: "Cut a new release — derives the procedure from the project's own release docs and any installed release skills, runs the release process, and reports the outcome."
user-invocable: true
disable-model-invocation: true
---

This is a thin entry point. The real release procedure is not in this skill — it lives in the project's own docs.

For the source of truth, consult, in order: `docs/RELEASING.md`, the "Releasing plugins" routing in `AGENTS.md`, and any installed release skill (for example a GitHub releases skill). Follow exactly what they define — version scheme, quality gates, and steps — and do not assume anything they don't state.

If there is no such guidance (no `docs/RELEASING.md` with real release content and no applicable release skill), stop and tell the user to add that doc first. Do not guess the version scheme or invent a release process.

Run the required quality gates before publishing; do not skip them. Confirm with the user before any outward-facing or hard-to-reverse step (pushing a tag, publishing the release, uploading artifacts).

Optional argument (advisory only — version, release type, or scope hint): $ARGUMENTS

Report the outcome faithfully.
