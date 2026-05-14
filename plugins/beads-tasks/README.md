# beads-tasks

Beads task tracking integration for Claude Code, with tasker, reviewer, and verifier agents.

## Overview

This plugin brings the beads (`bd`) workflow to Claude Code. It provides:

- Three skills covering routing, planning, and execution
- Three specialized subagents: **tasker**, **reviewer**, **verifier**

The orchestrator role (planning, tracker mutation ownership, subagent delegation) is handled by Claude Code itself when a beads skill is active.

## Prerequisites

Install the beads CLI:

```bash
npm install -g beads
```

Then initialize beads in your project:

```bash
bd init
```

## Usage

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
    ├── beads-core/
    │   ├── SKILL.md
    │   └── references/     (planning, issue workflow, execution, acceptance review, ticket rules)
    ├── beads-plan/
    │   └── SKILL.md        (full planning and orchestration workflow)
    └── beads-work/
        └── SKILL.md        (execution loop for running an existing plan)
```
