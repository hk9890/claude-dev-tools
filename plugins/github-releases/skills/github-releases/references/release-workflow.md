# Release Workflow

## 1. Prerequisites

```bash
bash scripts/check-release-prereqs.sh
```

## 2. Create Structure

```bash
bash scripts/create-release-tasks.sh <version>
```

## 3. Fill TODOs

**YOU MUST fill TODOs in all tasks.**

Read `docs/RELEASING.md` and replace TODO markers with project-specific commands.

## 4. Review

→ Spawn a **reviewer** agent to review the release structure for v\<version\>.

## 5. Execute

→ Spawn a **tasker** agent to execute task \<id\>.

Repeat for each ready task.

## 6. Verify

→ Spawn a **verifier** agent to verify task \<id\>.

## Rules

- Tests MUST pass (zero failures)
- Fill all TODOs (read docs/RELEASING.md)
- Delegate to subagents (never execute directly)
