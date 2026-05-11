# Change Workflow

## Task tracking

This repo uses the [beads](https://github.com/hanskohlreiter/beads) CLI for task tracking.

```bash
# Initialize beads in a project (already done for this repo)
bd init

# Create an issue
bd create "Short title" --body "Details"

# List open issues
bd list

# Mark done
bd close <id>
```

Beads state lives in `.beads/`. The pre-commit hook at `.beads/hooks/pre-commit` exports a snapshot to `.beads/issues.jsonl` on every commit so the tracker state is versioned alongside the code.

The hook runs `bd hooks run pre-commit` if the `bd` CLI is present. It is safe to commit without `bd` installed — the hook skips gracefully.

## Commit conventions

- One logical change per commit.
- Message: imperative, present tense ("Add X", "Fix Y", "Remove Z").
- Include a `Co-Authored-By` trailer when the commit was produced with AI assistance:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Branching

- `master` is the main branch.
- Feature work on short-lived branches; merge via PR or direct push for small changes.
- No force-push to `master`.
