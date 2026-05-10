# complexity-review

Skeptical complexity review for requirements, architecture, and code — bias toward simplicity.

## Overview

This plugin provides structured complexity reviews that challenge every abstraction, dependency, and feature. The default stance is: added complexity is guilty until proven necessary.

Covers three review types:
- **Requirements** — is this worth building? what should be deferred or removed?
- **Architecture** — challenge design, components, layers, and dependencies
- **Code / PR** — identify accidental complexity, unjustified indirection, and compatibility risk

## Commands

| Command | Description |
|---|---|
| `/complexity-review` | Run a skeptical complexity review on requirements, architecture, or code |

## Usage

```
/complexity-review <paste requirements / describe architecture / point at code>
```

The skill will detect the review type from context and apply the appropriate review workflow. You can also specify explicitly (e.g., `/complexity-review architecture: ...`).

## Review Output Structure

Every review produces:

1. **Verdict** — approve / approve with concerns / needs clarification / reject
2. **Principle pressure points** — which principles are most at stake
3. **Findings** — observation, why it matters, simpler alternative
4. **Open questions** — missing context blocking confident judgment
5. **What to remove, defer, or simplify** — explicit list
6. **What is justified** — complexity that has earned its place

## Plugin Structure

```
complexity-review/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   └── complexity-review.md
└── skills/
    └── complexity-review/
        ├── SKILL.md
        └── references/     (principles, requirements-review, architecture-review, code-pr-review)
```
