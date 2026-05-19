# beads-tasks plugin — rules & design decisions

## bd prime

We do NOT use `bd prime` for session context injection. Context is injected via our own `hooks/prime.md` + `hooks/prime.sh` because we want full control over the content — including the ability to make it dynamic in the future (conditional sections, project-specific overrides, version-gated content).
