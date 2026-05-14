# claude-catppuccin

Catppuccin Mocha color theme for Claude Code.

## Overview

This plugin applies the [Catppuccin Mocha](https://catppuccin.com/) palette to the Claude Code UI — a soothing dark theme with pastel accents. Every UI element maps to a canonical Mocha color: lavender for Claude messages, flamingo for shimmers, green for success, red for errors, and so on.

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
| Claude text | Lavender | `#cba6f7` |
| Prompt border | Blue | `#89b4fa` |
| Success / auto-accept | Green | `#a6e3a1` |
| Error | Red | `#f38ba8` |
| Warning | Yellow | `#f9e2af` |
| Inactive / subtle | Surface 1/2 | `#6c7086` / `#45475a` |
| Permission | Lavender (dim) | `#b4befe` |
| Plan mode | Teal | `#94e2d5` |
| Bash border | Peach | `#fab387` |
| IDE indicator | Sky | `#89dceb` |
| Background | Base | `#1e1e2e` |
| User message bg | Mantle | `#181825` |

## Plugin Structure

```
claude-catppuccin/
├── .claude-plugin/
│   └── plugin.json
└── themes/
    └── catppuccin-mocha.json
```
