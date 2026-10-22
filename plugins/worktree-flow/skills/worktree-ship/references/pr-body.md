# PR body

```markdown
## Summary

<one or two sentences: what changed and why>

<optional: the smallest view that makes the point clear: pseudocode, a call tree, a file tree, a Mermaid diagram, a diff of a changed shape, or the whole of a mostly new one>

## Evidence

- **Gate:** `<command>`: <passed, failed, or skipped, and why>
- **Driven:** `<command>`: <what it showed, or not driven, why, and what to check by hand>
- <optional: **Before:** / **After:** output or test run>

## Merge Danger

**Door:** <one-way or two-way>

**Blast Radius:** <none, local, consumers, or data>

<optional: what the merge can break>
```

Keep prose brief, in the project's own terms. `worktree-flow:worktree-review` adds the **Review** line to `## Evidence`.

A one-way door is a destructive or hard-to-reverse change. The blast radius is the widest thing the merge can break: `none` (docs or comments), `local` (the changed module and its callers here), `consumers` (anything that installs or calls this project), `data` (stored data, or anything a rollback does not restore).
