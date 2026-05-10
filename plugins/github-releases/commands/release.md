---
description: Create a new GitHub release — runs quality gates, version bump, and release creation
---

Load the `github-releases` skill.

Treat this as optional version/context guidance:

$ARGUMENTS

Follow the skill's release workflow:
- Check prerequisites (gh auth, clean working tree)
- Read docs/RELEASING.md for project-specific commands
- Create a release checklist and execute each phase in order
- Quality gates → documentation check → version bump → create release → release notes → verify → cleanup
