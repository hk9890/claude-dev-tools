# beads-tasks

Beads task tracking integration for Claude Code, with tasker, reviewer, and verifier agents.

## Overview

This plugin brings the beads (`bd`) workflow to Claude Code. It provides:

- The `beads-tasks` skill — orchestration rules and workflow guidance
- Three specialized subagents: **tasker**, **reviewer**, **verifier**

The orchestrator role (planning, tracker mutation ownership, subagent delegation) is handled by Claude Code itself when the `coder-beads` skill is active. Use Claude Code's built-in **planning mode** for the planning/discussion phase.

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

Enter planning mode and describe what you want to build. Claude Code will load the `coder-beads` skill and create a structured epic with tasks.

### Execution

Once a plan is in place, Claude Code will check `bd ready` for unblocked work and spawn the appropriate agents:

- **tasker** — implements a single task and returns results
- **reviewer** — provides critical feedback on plans, architecture, or code
- **verifier** — verifies completed work against acceptance criteria

All beads tracker mutations (`bd create`, `bd update`, `bd close`) are handled by Claude Code, not the subagents. Subagents are read-only on the tracker.

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
    └── coder-beads/
        ├── SKILL.md
        └── references/     (planning, issue workflow, execution, acceptance review, etc.)
```
