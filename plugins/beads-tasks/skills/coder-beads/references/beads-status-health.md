# Beads Status & Health

Health checks for a usable beads workflow surface.

## Core health components

1. `bd` CLI installed and callable
2. `.beads/` tracker initialized
3. hooks installed
4. tracker status commands return successfully

## Quick health check

```bash
bd --version
ls -la .beads/
ls -la .git/hooks/pre-commit
bd status
```

## Comprehensive check

```bash
which bd
bd doctor
bd ready
bd blocked
```

Interpretation:

- `bd ready` should contain only executable work
- `bd blocked` should contain dependency/discussion-gated work

## Common warning patterns

- hooks missing after environment reset
- blocked discussion tasks accidentally reopened
- acceptance-review gates missing on epics

For fixes, use:

- [beads-setup-troubleshooting.md](beads-setup-troubleshooting.md)
- [beads-runtime-troubleshooting.md](beads-runtime-troubleshooting.md)
