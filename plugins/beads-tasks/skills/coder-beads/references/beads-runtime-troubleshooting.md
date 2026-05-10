# Beads Runtime Troubleshooting

Diagnose runtime tracker/database and workflow-execution failures.

## `bd` runtime/database errors

Use this fix sequence first:

```bash
bd doctor
bd doctor --fix
bd bootstrap
```

If diagnostics mention uncommitted tracker state:

```bash
bd vc status
```

## Commands failing unexpectedly during execution loops

Checks:

```bash
bd status
bd ready
bd blocked
```

Look for:

- stale blocked discussion issues incorrectly moved to ready
- missing dependencies that should serialize tasks
- acceptance-review gate not represented as a task

## Tasks claimed but not progressing

Verify assignment and state:

```bash
bd show <id>
bd update <id> --status=in_progress
```

If task is not executable (ambiguous/stale), add explicit blocker comment and stop execution.

## Tracker state drift

When issue comments changed intent but task body stayed stale:

1. add a comment documenting the stale mismatch
2. block the task until description/instructions are aligned
3. avoid implementation based on guessed intent

## Escalate unresolved runtime failures

If unresolved after doctor/bootstrap, collect evidence and file a tracker bug using [beads-bug-reporting.md](beads-bug-reporting.md).
