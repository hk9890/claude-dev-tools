# claude-catppuccin

Catppuccin Mocha color theme for Claude Code.

## Overview

This plugin applies the [Catppuccin Mocha](https://catppuccin.com/) palette to the Claude Code UI — a soothing dark theme with pastel accents. Every UI element maps to a canonical Mocha color: mauve for Claude messages, pink for shimmers, green for success, red for errors, and so on.

## Installation

Install via the Claude Code plugin system. Once installed, activate the theme:

```
/config
```

Navigate to **Theme** and select **Catppuccin Mocha**.

## Palette

The theme maps Catppuccin Mocha colors to Claude Code UI roles:

| Role | Color | Hex |
|---|---|---|
| Claude text | Mauve | `#cba6f7` |
| Claude shimmer | Pink | `#f5c2e7` |
| Prompt border | Mauve | `#cba6f7` |
| Prompt border shimmer | Pink | `#f5c2e7` |
| Success / auto-accept | Green | `#a6e3a1` |
| Remember | Lavender | `#b4befe` |
| Error | Red | `#f38ba8` |
| Warning | Yellow | `#f9e2af` |
| Inactive | Overlay 0 | `#6c7086` |
| Subtle | Surface 1 | `#45475a` |
| Suggestion / match highlight | Mauve | `#cba6f7` |
| Selection bg | Surface 2 | `#585b70` |
| Permission | Lavender | `#b4befe` |
| Permission shimmer | Mauve | `#cba6f7` |
| Brief label (You) | Lavender | `#b4befe` |
| Brief label (Claude) | Mauve | `#cba6f7` |
| Plan mode | Teal | `#94e2d5` |
| Bash border | Peach | `#fab387` |
| IDE indicator | Sky | `#89dceb` |
| Text | Text | `#cdd6f4` |
| Inverse text | Base | `#1e1e2e` |
| User message bg | Surface 0 | `#313244` |
| User message bg (hover) | Surface 1 | `#45475a` |
| Message actions bg | Surface 2 | `#585b70` |
| Bash message bg | Mantle | `#181825` |
| Memory message bg | Crust | `#11111b` |

Diff background colors (`diffAdded`, `diffRemoved`, and their `*Dimmed`/`*Word` variants) are not from the canonical palette — they are custom dark green/red tints derived from Base for terminal readability.

## Plugin structure

```
claude-catppuccin/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── RULES.md
└── themes/
    └── catppuccin-mocha.json
```
