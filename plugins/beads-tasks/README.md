# beads-tasks

Beads task tracking integration for Claude Code, with tasker, reviewer, and verifier agents.

## Overview

This plugin brings the beads (`bd`) workflow to Claude Code. It provides:

- Two user-facing skills — **beads-plan** (planning) and **beads-work** (execution)
- One internal skill — **beads-core**, a shared reference library loaded by the other two; not invoked directly
- Three specialized subagents: **tasker**, **reviewer**, **verifier**

The orchestrator role (planning, tracker mutation ownership, subagent delegation) is handled by Claude Code itself when a beads skill is active.

## Prerequisites

Install the beads CLI:

```bash
npm install -g @beads/bd
```

Then initialize beads in your project:

```bash
bd init
```

## Usage

The two entry points are `beads-plan` and `beads-work`. `beads-core` is an
internal reference library — it is loaded automatically by the other skills and
agents, and is not meant to be invoked directly by users.

### Planning phase

Use `/beads-tasks:beads-plan` to describe what you want to build. Claude Code will create a structured epic with tasks in the tracker.

### Execution

Use `/beads-tasks:beads-work` to run an existing plan. Claude Code will check `bd ready` for unblocked work and spawn the appropriate agents:

- **tasker** — implements a single task and returns results
- **reviewer** — provides critical feedback on plans, architecture, or code
- **verifier** — verifies completed work against acceptance criteria

All beads tracker mutations (`bd create`, `bd update`, `bd close`) are handled by Claude Code, not the subagents. Subagents are read-only on the tracker and reference `beads-core` for conventions.

## Plugin Structure

```
beads-tasks/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   ├── tasker.md
│   ├── reviewer.md
│   └── verifier.md
└── skills/
    ├── beads-core/         (internal reference library — not invoked directly)
    │   ├── SKILL.md
    │   ├── references/     (planning, issue workflow, execution, acceptance review, ticket rules)
    │   └── scripts/        (new-ar-task.sh — canonical Acceptance Review task creator)
    ├── beads-plan/
    │   └── SKILL.md        (full planning and orchestration workflow)
    └── beads-work/
        └── SKILL.md        (execution loop for running an existing plan)
```
