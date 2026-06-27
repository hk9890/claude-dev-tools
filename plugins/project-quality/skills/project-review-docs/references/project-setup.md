# Project-Doc Setup

## Baseline model

- `README.md`: user-facing project entrypoint
- `AGENTS.md`: routing layer (routing table for all AI tools)
- `CLAUDE.md`: Claude Code entrypoint — **must contain exactly `@AGENTS.md` and nothing else** (one line, optional trailing newline). Any other content is a finding; the recommended fix routes it into AGENTS.md (for routing) or a topic doc under `docs/`. Checkable via `scripts/claude-md.sh check`.
- `docs/` topic files: durable repo-specific operating guidance
- `docs/REVIEWING.md` (optional-canonical): project-specific review guidance — canonical when present, never reported missing when absent
- `docs/RUNNING.md` (optional-canonical): how the agent launches and drives the built product to reproduce a bug or verify a change — canonical when present, never reported missing when absent
- `.claude.local.md` (optional, personal): per-user local context — gitignored; never written by canonical doc flows (create/update/improve/revise); surfaced by `scripts/inventory.py` so authors know it exists

Create topic docs only when the repository has real local guidance for that topic.

## Canonical topic set

Use these names when relevant:

```text
docs/
  OVERVIEW.md
  CODING.md
  TESTING.md
  RUNNING.md         (optional — see below)
  REVIEWING.md       (optional — see below)
  RELEASING.md
  MONITORING.md
  CHANGE-WORKFLOW.md
```

Notes:

- If a reusable skill fully covers a topic and there is no local delta, do not create a hollow doc for that topic.
- `REVIEWING.md` is **optional-canonical**: recognized as a canonical doc when a project opts in by creating it, but never reported missing when absent (most repos have no local review delta). `scripts/inventory.py` counts it only when present and never nags for it.
- `RUNNING.md` is **optional-canonical** on the same terms: create it only when the project ships a product an agent can drive (a CLI, service, TUI, or app). A pure library whose tests are its only exercise path needs none; it is never reported missing when absent.

## File ownership boundaries

### `CLAUDE.md`

- **Hard contract**: CLAUDE.md is exactly `@AGENTS.md` (one line, optional trailing newline). Anything else is a bug.
- New instructions/routing always go to `AGENTS.md`, never to `CLAUDE.md`.
- Existing non-canonical CLAUDE.md content (framing text, embedded handbooks, injected tool blocks, personal notes) is a finding; the recommended fix names the routing destination:
  - routing → `AGENTS.md`
  - topic procedures → the matching `docs/<TOPIC>.md`
  - personal/local notes → `.claude.local.md`
  - auto-injected tool blocks → topic doc under `docs/` or `.claude.local.md` (never in steering docs)
- Checkable via `scripts/claude-md.sh check`, which hard-fails on extra content.

### `.claude.local.md` (optional, personal)

- Personal/local context only; gitignored, never shared with the team
- Never written by canonical doc flows (create/update/improve/revise) — the user edits this file directly
- Surfaced by `scripts/inventory.py` under `personal_local` so authors know it exists
- Use for: personal Claude preferences, machine-specific paths, in-progress scratch notes that should not land in shared docs

### `README.md`

- Project identity and front-door usage context
- Links to deeper docs
- Example: [../examples/README.md](../examples/README.md)

### `AGENTS.md`

- Routing table only
- Short project summary + task-to-doc/skill routes
- Avoid duplicating full procedures
- Example: [../examples/AGENTS.md](../examples/AGENTS.md)

### `docs/OVERVIEW.md`

- Architecture and domain orientation
- MUST NOT duplicate `AGENTS.md` — no re-listing of the docs/skills it already routes to (see [project-doc-guidelines.md](project-doc-guidelines.md), rule A7)
- Example: [../examples/docs/OVERVIEW.md](../examples/docs/OVERVIEW.md)

### `docs/CODING.md`

- Repository-specific implementation constraints and edit patterns
- Example: [../examples/docs/CODING.md](../examples/docs/CODING.md)

### `docs/TESTING.md`

- Test-layer policy, commands, and minimum checks
- Example: [../examples/docs/TESTING.md](../examples/docs/TESTING.md)

### `docs/RELEASING.md`

- Repo-specific release constraints and entrypoints
- Example: [../examples/docs/RELEASING.md](../examples/docs/RELEASING.md)

### `docs/MONITORING.md`

- Repo-specific observability and evidence paths
- **Boundary vs RUNNING.md**: MONITORING inspects the evidence of what already happened
  (logs, spans, sessions, usage); RUNNING drives the live product to make something happen.
  Bug reproduction is driven from `RUNNING.md`, which may pull MONITORING data as supporting
  evidence.
- Example: [../examples/docs/MONITORING.md](../examples/docs/MONITORING.md)

### `docs/CHANGE-WORKFLOW.md`

- Commit/push/branch/PR/review/merge expectations
- Example: [../examples/docs/CHANGE-WORKFLOW.md](../examples/docs/CHANGE-WORKFLOW.md)

### `docs/REVIEWING.md` (optional-canonical)

- Project-specific review guidance that reviewers — human or AI, including the
  `project-review-*` skills and the shared `project-reviewer` persona — must
  honor when reviewing changes in this repo.
- **Boundary vs the review skills**: the `project-review-*` skills supply the
  generic, reusable review lenses (complexity, structure, consistency, tests,
  docs); `REVIEWING.md` holds only the **local delta** those lenses cannot
  know — repo-specific priorities, must-check rules, and out-of-scope /
  non-blocking conventions. Do not restate a generic review checklist here
  (A4); link the skills and state only what is local.
- **Precedence**: where local policy conflicts with a skill's default lens, the
  local `REVIEWING.md` rule wins.
- **Optional-canonical**: create it only when the project has a real review
  delta; it is never reported missing when absent (see the canonical topic set
  above).
- Example: [../examples/docs/REVIEWING.md](../examples/docs/REVIEWING.md)

### `docs/RUNNING.md` (optional-canonical)

- How the agent launches and drives *this project's built product* by hand to observe
  real behavior — reproduce a reported bug, verify an outcome after a task, confirm a fix.
  It is **agent-facing**: how the *agent* operates the product, which can diverge from the
  human path (a browser-automation tool, a TUI-inspection script where a human would just
  click). Operating the artifact, not running the test suites.
- **Boundary vs TESTING.md**: TESTING owns the automated suites, validators, and gates
  (repeatable pass/fail you maintain); RUNNING owns driving the running product ad-hoc to
  observe behavior. The generic launch-and-drive workflow is covered by the built-in
  `run`/`verify` skills — RUNNING holds only the local delta (launch command, entrypoints,
  how to reach a state, fixtures, where output lands). Authoring rule A4 applies; placement
  is fixed by A9.
- **Boundary vs MONITORING.md**: both can serve bug reproduction. RUNNING *makes* the
  product do it (hands on the live app); MONITORING *inspects* what it already did. The
  reproduction is driven from RUNNING, which may pull MONITORING data as supporting
  evidence (stated symmetrically in the MONITORING block above).
- **Precedence**: where a local `RUNNING.md` instruction conflicts with the generic
  `run`/`verify` flow, the local instruction wins — it knows this product's real entrypoints.
- **Optional-canonical**: create it only when the project ships a product an agent can
  drive; it is never reported missing when absent (see the canonical topic set above).
- Example: [../examples/docs/RUNNING.md](../examples/docs/RUNNING.md)

## Boundary to project-structure

`project-setup.md` defines **what docs exist and who owns what**.

Use [project-structure.md](project-structure.md) for:

- structural constraints
- AGENTS routing structure rules
