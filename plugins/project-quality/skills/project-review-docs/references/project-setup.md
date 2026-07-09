# Project-Doc Setup

## Baseline model

The canonical files and who each serves (full boundaries in **File ownership
boundaries** below):

- `README.md` — user-facing product entrypoint: how to *use* the product.
- `CONTRIBUTING.md` (optional) — human-contributor entrypoint ("`AGENTS.md` for humans").
- `AGENTS.md` — the routing layer for all AI tools.
- `CLAUDE.md` — Claude Code entrypoint: exactly `@AGENTS.md`, nothing else.
- `docs/` topic files (all optional) — durable repo-specific operating guidance; see the topic set below.
- `.claude.local.md` (optional, personal) — per-user local context; gitignored.

**Every `docs/` topic file is optional** — create one only when the repository has real
local guidance for that topic. No topic doc is ever reported missing; the canonical names
below are the names to *use* when you do document a topic (rule R11), not a required set.
Only the root steering files (`README.md`, `AGENTS.md`, `CLAUDE.md`) are required
(`CONTRIBUTING.md` is optional too).

## Canonical topic set

```text
docs/                (every file below is optional — add it if you need it)
  OVERVIEW.md
  CODING.md
  TESTING.md
  RUNNING.md
  REVIEWING.md
  RELEASING.md
  MONITORING.md
  CHANGE-WORKFLOW.md
```

- If a reusable skill fully covers a topic with no local delta, do not create a hollow doc for it.
- A doc whose **content** is a canonical topic but sits under a **non-canonical name** (anywhere under `docs/` or at the repo root) is a finding (R11): rename it to the canonical name when that slot is empty, or link it from the canonical doc when the slot is filled. Content-driven — the review never invents a doc for an absent topic.

## File ownership boundaries

Each block states the file's audience/purpose and its **Inside** (what belongs) and
**Not inside** (what routes elsewhere). The review validates content against these (R10).

### `CLAUDE.md`

- **Inside**: exactly `@AGENTS.md` (one line, optional trailing newline).
- **Not inside**: anything else — new routing goes to `AGENTS.md`, never here.
- Existing non-canonical content (framing text, embedded handbooks, injected tool blocks, personal notes) is a finding; the fix names the destination: routing → `AGENTS.md`; topic procedures → `docs/<TOPIC>.md`; personal notes → `.claude.local.md`; injected tool blocks → a topic doc or `.claude.local.md` (never a steering doc).
- Reported by `scripts/manifest.py` (the `CLAUDE.md` invariant).

### `.claude.local.md` (optional, personal)

- **Inside**: personal/local context — Claude preferences, machine-specific paths, scratch notes.
- **Not inside**: shared/team guidance, routing, anything the canonical doc flows write.
- Gitignored; never written by canonical doc flows (the user edits it directly). Surfaced by `scripts/manifest.py` (classification `personal-local`).

### `README.md`

- **Audience**: users / evaluators of the product.
- **Inside**: what the product is, how to install/run a release, basic usage, links to deeper docs, license.
- **Not inside**: build-from-source / dev setup, dev task lists, contributor/PR workflow, architecture internals, release engineering — these route to `CONTRIBUTING.md` and the topic docs.
- Example: [../examples/README.md](../examples/README.md)

### `CONTRIBUTING.md` (optional-canonical)

- **Audience**: human contributors — the human counterpart to `AGENTS.md`.
- **Inside**: dev-environment setup, build/test/run from source, and how to propose a change; **routes** to `CODING.md` / `TESTING.md` / `CHANGE-WORKFLOW.md` rather than restating them.
- **Not inside**: end-user usage (→`README.md`), AI routing (→`AGENTS.md`), deep architecture (→`docs/OVERVIEW.md`), release internals (→`docs/RELEASING.md`); no duplicated command reference.
- Example: [../examples/CONTRIBUTING.md](../examples/CONTRIBUTING.md)

### `AGENTS.md`

- **Audience**: AI agents.
- **Inside**: a 2–3 sentence project summary and task → doc/skill routes.
- **Not inside**: full procedures, README-style prose, content duplicated from the docs it routes to.
- **Conformance** (checked against the example): one `###` section per use case, each naming the doc/skill to load and a one-line reason; skip hollow entries; keep the summary to 2–3 sentences; route to installed skills by name when no local doc exists.
- Example: [../examples/AGENTS.md](../examples/AGENTS.md)

### `docs/OVERVIEW.md`

- **Purpose**: a *findability map* — lets an agent locate things in and outside the repo without duplicating what the repo already contains.
- **Inside**: high-level structure and architecture (not per-file detail); important external links; search expressions (`grep`/`rg`) for finding things.
- **Not inside**: detailed package/file lists or domain model (those live in source), build/test commands, usage, and any re-listing of what `AGENTS.md` already routes to (A7).
- Example: [../examples/docs/OVERVIEW.md](../examples/docs/OVERVIEW.md)

### `docs/CODING.md`

- **Inside**: build commands and the coding rules/guidelines needed when modifying files — short, with examples pointing to real classes/files.
- **Not inside**: end-user usage, release process, observability, PR/merge etiquette.
- Example: [../examples/docs/CODING.md](../examples/docs/CODING.md)

### `docs/TESTING.md`

- **Inside**: test layers, commands, fixtures, minimum checks and CI gates; coverage targets and how to run with coverage; when integration tests are required; and how to write tests, with examples pointing to existing tests.
- **Not inside**: driving the product (→`docs/RUNNING.md`), release steps, architecture.
- Example: [../examples/docs/TESTING.md](../examples/docs/TESTING.md)

### `docs/RELEASING.md`

- **Inside**: repo-specific release steps, triggers, entrypoints, and verification commands.
- **Not inside**: routine build/test, end-user usage, architecture.
- Example: [../examples/docs/RELEASING.md](../examples/docs/RELEASING.md)

### `docs/MONITORING.md`

- **Inside**: how the agent accesses monitoring data (logs, spans, metrics, sessions, usage) and how to interpret it.
- **Not inside**: driving the live product (→`docs/RUNNING.md`), test suites, architecture.
- **Boundary vs `RUNNING.md`**: MONITORING inspects the evidence of what already happened; RUNNING drives the live product to make something happen. Bug reproduction is driven from `RUNNING.md`, which may pull MONITORING data as evidence.
- Example: [../examples/docs/MONITORING.md](../examples/docs/MONITORING.md)

### `docs/CHANGE-WORKFLOW.md`

- **Inside**: commit/branch/push/PR/review/merge expectations and pre-handoff gates.
- **Not inside**: build/test command reference (→`docs/CODING.md`/`docs/TESTING.md`), usage, architecture.
- Example: [../examples/docs/CHANGE-WORKFLOW.md](../examples/docs/CHANGE-WORKFLOW.md)

### `docs/REVIEWING.md`

- **Inside**: repo-specific review priorities, must-check rules, and out-of-scope / non-blocking conventions — the **local delta** the generic `project-review-*` skills cannot know. State only what is local and link the skills (A4).
- **Not inside**: generic review checklists (those live in the `project-review-*` skills), implementation rules.
- **Precedence**: where local policy conflicts with a skill's default lens, the local rule wins.
- Example: [../examples/docs/REVIEWING.md](../examples/docs/REVIEWING.md)

### `docs/RUNNING.md`

- **Inside**: how the *agent* builds, starts, and drives the product by hand (start the webapp and inspect pages, run the CLI/TUI) to reproduce a bug or verify a change — the local delta (launch command, entrypoints, how to reach a state, where output lands). State only what is local and link the `run`/`verify` skills (A4).
- **Not inside**: automated test suites (→`docs/TESTING.md`), coding/implementation (→`docs/CODING.md`), log inspection (→`docs/MONITORING.md`).
- **Precedence**: where a local instruction conflicts with the generic `run`/`verify` flow, the local instruction wins. (Boundary vs `MONITORING.md`: see that block.)
- Example: [../examples/docs/RUNNING.md](../examples/docs/RUNNING.md)

## Locations & routing

All docs live at the project root or under `docs/`:

| File | Location |
|---|---|
| `CLAUDE.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md` | project root |
| Topic docs | `docs/` |

- Keep `AGENTS.md` concise and pointer-based; every route must point to a real file or installed skill.
- Flag stale routes left behind after merges or deletions.
