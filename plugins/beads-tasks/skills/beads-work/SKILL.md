---
name: beads-work
description: "Run the beads execution loop — determines what to work on from conversation context or the ready queue, proposes it to the user, and only starts after explicit confirmation."
user-invocable: true
disable-model-invocation: true
---

## Workflow

**Preflight — beads CLI check.** Before any tracker work, confirm the `bd` CLI is on PATH:

```bash
command -v bd >/dev/null 2>&1 || echo "MISSING"
```

If `bd` is missing, stop and tell the user: *the beads CLI is not installed — run `npm install -g @beads/bd` (and `bd init` if `.beads/` does not yet exist), then re-invoke this skill.* Do not write to the tracker until `bd` is available.

1. Load `beads-tasks:beads-core` for the routing table.
2. Load and follow the **work intake** instructions to decide what to work on (conversation references first, tracker discovery second) and propose it to the user. Do not write to the tracker or spawn agents during intake.
3. On explicit user confirmation of the proposed work, load and follow the **execution orchestration** instructions to run the plan-review gate, delegate to taskers and verifiers, apply tracker updates, and close the epic.

Throughout, apply the **core rules** — serialized writes, agent delegation, git safety.
