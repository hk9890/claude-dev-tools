# AGENTS Generation Template (Docs-Lifecycle Scope)

Template/format guidance for generating AGENTS routing during docs lifecycle workflows.

Use with:

- [project-docs-lifecycle.md](project-docs-lifecycle.md)
- [project-setup.md](project-setup.md)
- [project-structure.md](project-structure.md)

## Output intent

Generate a compact AGENTS file that routes tasks to canonical docs and installed skills.

- Target style: routing table, not handbook
- Keep inline content minimal (project identity + session completion rules if required by project policy)

## Path placeholders

- `{agents_md}`: mode-correct AGENTS location
- `{docs}`: mode-correct docs directory

## Section pattern

Recommended sections (conditionally included by relevance):

- Project Overview
- Coding
- Testing
- Releases
- Monitoring
- Change Workflow
- Landing the Plane

For change-landing topics, route to `{docs}CHANGE-WORKFLOW.md` when present.

## Generation workflow

1. Gather project identity, tech stack, commands, docs inventory, and installed skills.
2. Map discovered docs/skills to section coverage.
3. Propose consolidation for non-standard docs before routing finalization.
4. Create missing standard docs only when local guidance exists.
5. Generate or refresh AGENTS using mode-correct paths.
6. Verify all routes resolve.

## Verification checklist

- Every referenced path exists.
- Skill references are installed/available.
- No section implies a missing doc is required when topic is skill-only.
- No duplicate long-form guidance is inlined.
- Mode-specific paths are correct.
- Canonical routes are current after consolidation actions.
