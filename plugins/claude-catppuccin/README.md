# claude-catppuccin

Catppuccin color themes for Claude Code — all four flavours.

## Overview

This plugin applies the [Catppuccin](https://catppuccin.com/) palette to the
Claude Code UI. It ships all four official flavours:

| Flavour | Theme name | Mood |
| --- | --- | --- |
| Latte | Catppuccin Latte | Light, soft, readable |
| Frappé | Catppuccin Frappé | Muted dark pastel |
| Macchiato | Catppuccin Macchiato | Cozy dark |
| Mocha | Catppuccin Mocha | Deep dark |

Every UI element maps to a canonical Catppuccin color — mauve for Claude
messages, pink for shimmers, green for success, red for errors, and so on. The
same semantic mapping is used for all four flavours; only the underlying palette
changes.

## Installation

Install via the Claude Code plugin system. Once installed, activate a theme:

```
/config
```

Navigate to **Theme** and select one of **Catppuccin Latte / Frappé /
Macchiato / Mocha**. All four appear automatically once the plugin is enabled.

## Color mapping

Each Claude Code UI role maps to a named Catppuccin palette entry. The role
mapping is identical across flavours; the hex value is that flavour's palette
color (see the [official palette](https://catppuccin.com/palette/)).

| Role | Palette color |
|---|---|
| Claude text / suggestion / prompt border / rate-limit fill | Mauve |
| Claude shimmer / prompt-border shimmer | Pink |
| Permission / remember / brief label (You) | Lavender |
| Success / auto-accept | Green |
| Error | Red |
| Warning / fast mode | Yellow |
| Warning shimmer / bash border | Peach |
| Plan mode / merged | Teal |
| IDE indicator | Sky |
| Text | Text |
| Inverse text | Base |
| Inactive | Overlay 0 |
| Subtle / rate-limit empty | Surface 1 |
| Selection / message actions bg | Surface 2 |
| User message bg | Surface 0 |
| Bash message bg | Mantle |
| Memory message bg | Crust |

Diff background colors (`diffAdded`, `diffRemoved`, and their `*Dimmed`/`*Word`
variants) are **not** from the canonical palette — the theme system has no alpha
channel, so they are opaque tints. Dark flavours reuse Mocha's hand-tuned
per-channel offset from its base, re-anchored on each flavour's own base; Latte
(light) tints its light base toward the flavour's green/red. See
[RULES.md](RULES.md).

## Regenerating themes

The four theme files are generated from a single source of truth
(`scripts/generate-themes.mjs`): one shared role→palette map plus the four
official palettes. Do not hand-edit `themes/*.json`. To change the mapping or
palettes, edit the generator and regenerate:

```
node scripts/generate-themes.mjs
```

The plugin's script-tests fail if the committed files drift from the generator
output.

## Plugin structure

```
claude-catppuccin/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── RULES.md
├── scripts/
│   └── generate-themes.mjs
└── themes/
    ├── catppuccin-latte.json
    ├── catppuccin-frappe.json
    ├── catppuccin-macchiato.json
    └── catppuccin-mocha.json
```
