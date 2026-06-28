# Project-Doc Setup

## Baseline model

- `README.md`: user-facing **product** entrypoint — how to *use* the product
- `CONTRIBUTING.md` (optional-canonical): human-contributor entrypoint — "`AGENTS.md` for humans"; describes the contribution path and routes to the topic docs without duplicating them. Canonical when present, never reported missing when absent.
- `AGENTS.md`: routing layer (routing table for all AI tools)
- `CLAUDE.md`: Claude Code entrypoint — **must contain exactly `@AGENTS.md` and nothing else** (one line, optional trailing newline). Any other content is a finding; the recommended fix routes it into AGENTS.md (for routing) or a topic doc under `docs/`. Checkable via `scripts/claude-md.sh check`.
- `docs/` topic files: durable repo-specific operating guidance
- `docs/REVIEWING.md` (optional-canonical): project-specific review guidance — canonical when present, never reported missing when absent
- `docs/RUNNING.md` (optional-canonical): how the agent launches and drives the built product to reproduce a bug or verify a change — canonical when present, never reported missing when absent
- `.claude.local.md` (optional, personal): per-user local context — gitignored; never written by canonical doc flows (create/update/improve/revise); surfaced by `scripts/inventory.py` so authors know it exists

Create topic docs only when the repository has real local guidance for that topic.

Each canonical file has a defined **audience/purpose** and an explicit *Inside* / *Not inside*
boundary in the ownership section below. Content that lands in the wrong file — most commonly
build/dev material in `README.md` — is a finding even when every individual statement is
factually accurate (rule R10; see the review guidelines).

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
- `CONTRIBUTING.md` (repo root, not under `docs/`) is **optional-canonical**: recognized when present, never reported missing when absent (a repo with no external human contributors may legitimately omit it).
- A doc whose **content** is a canonical topic but lives under a **non-canonical name** is a finding (R11), independent of the rules above: rename it to the canonical name when that slot is empty, or link it from the canonical doc when the slot is already filled. This is content-driven — the review reads docs that already exist and never invents one for an absent topic, so the optional-canonical "never missing when absent" contract stands.

## File ownership boundaries

Each block states the file's audience/purpose and its **Inside** (what belongs) and
**Not inside** (what routes elsewhere) boundary. The review validates doc content against
these (R10).

### `CLAUDE.md`

- **Inside**: exactly `@AGENTS.md` (one line, optional trailing newline).
- **Not inside**: anything else.
- **Hard contract**: CLAUDE.md is exactly `@AGENTS.md`. Anything else is a bug.
- New instructions/routing always go to `AGENTS.md`, never to `CLAUDE.md`.
- Existing non-canonical CLAUDE.md content (framing text, embedded handbooks, injected tool blocks, personal notes) is a finding; the recommended fix names the routing destination:
  - routing → `AGENTS.md`
  - topic procedures → the matching `docs/<TOPIC>.md`
  - personal/local notes → `.claude.local.md`
  - auto-injected tool blocks → topic doc under `docs/` or `.claude.local.md` (never in steering docs)
- Checkable via `scripts/claude-md.sh check`, which hard-fails on extra content.

### `.claude.local.md` (optional, personal)

- **Inside**: personal/local context — personal Claude preferences, machine-specific paths, in-progress scratch notes.
- **Not inside**: shared/team guidance, routing, anything the canonical doc flows write.
- Personal/local context only; gitignored, never shared with the team
- Never written by canonical doc flows (create/update/improve/revise) — the user edits this file directly
- Surfaced by `scripts/inventory.py` under `personal_local` so authors know it exists

### `README.md`

- **Audience**: users / evaluators of the product.
- **Inside**: what the product is, how to install/run a release, basic usage, links to deeper docs, license.
- **Not inside**: build-from-source / dev setup, dev task lists, contributor/PR workflow, architecture internals, release engineering — these route to `CONTRIBUTING.md` and the topic docs.
- Example: [../examples/README.md](../examples/README.md)

### `CONTRIBUTING.md` (optional-canonical)

- **Audience**: human contributors — the human counterpart to `AGENTS.md`.
- **Inside**: how to set up the dev environment, build/test/run from source, and propose a change. May read a little more narratively than `AGENTS.md`, but **routes** to `CODING.md` / `TESTING.md` / `CHANGE-WORKFLOW.md` rather than restating them.
- **Not inside**: end-user usage (→`README.md`), AI routing (→`AGENTS.md`), deep architecture (→`docs/OVERVIEW.md`), release internals (→`docs/RELEASING.md`); no duplicated command reference.
- **Optional-canonical**: recognized when present, never reported missing when absent.
- Example: [../examples/CONTRIBUTING.md](../examples/CONTRIBUTING.md)

### `AGENTS.md`

- **Audience**: AI agents.
- **Inside**: a 2–3 sentence project summary and task → doc/skill routes.
- **Not inside**: full procedures, README-style prose, content duplicated from the docs it routes to.
- Routing table only; avoid duplicating full procedures.
- Example: [../examples/AGENTS.md](../examples/AGENTS.md)

### `docs/OVERVIEW.md`

- **Purpose**: a *findability map* — it lets an agent doing search/planning locate things in the repo and outside, without duplicating what the repo already contains.
- **Inside**: high-level structure and architecture (not per-file detail); important external links; search expressions (`grep`/`rg` queries) for finding things in the repo.
- **Not inside**: detailed package/file lists or domain model (those live in source), build/test commands, usage, and any re-listing of the docs/skills `AGENTS.md` already routes to (rule A7).
- Example: [../examples/docs/OVERVIEW.md](../examples/docs/OVERVIEW.md)

### `docs/CODING.md`

- **Inside**: build commands and the general coding rules/guidelines needed when modifying files — kept short, with examples that point to real classes/files in the codebase.
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
- **Boundary vs RUNNING.md**: MONITORING inspects the evidence of what already happened;
  RUNNING drives the live product to make something happen. Bug reproduction is driven from
  `RUNNING.md`, which may pull MONITORING data as supporting evidence.
- Example: [../examples/docs/MONITORING.md](../examples/docs/MONITORING.md)

### `docs/CHANGE-WORKFLOW.md`

- **Inside**: commit/branch/push/PR/review/merge expectations and pre-handoff gates.
- **Not inside**: build/test command reference (→`docs/CODING.md`/`docs/TESTING.md`), usage, architecture.
- Example: [../examples/docs/CHANGE-WORKFLOW.md](../examples/docs/CHANGE-WORKFLOW.md)

### `docs/REVIEWING.md` (optional-canonical)

- **Inside**: repo-specific review priorities, must-check rules, and out-of-scope / non-blocking conventions.
- **Not inside**: generic review checklists (those live in the `project-review-*` skills), implementation rules.
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

- **Inside**: how the agent builds and starts the product and drives it by hand (e.g. start the
  webapp and browse/inspect pages, or run the CLI/TUI) to *use the thing being built* — so it can
  reproduce a reported bug or verify an outcome after a change.
- **Not inside**: automated test suites (→`docs/TESTING.md`), coding/implementation
  (→`docs/CODING.md`), log inspection (→`docs/MONITORING.md`).
- It is **agent-facing**: how the *agent* operates the product, which can diverge from the
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
