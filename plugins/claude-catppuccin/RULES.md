# style plugin — rules and design decisions

## Scope

This plugin is strictly visual. It ships color themes only. No commands, skills,
agents, hooks, or output styles. `scripts/generate-themes.mjs` is a build-time
generator, not a runtime plugin surface.

## Theme delivery mechanism

Themes are distributed natively via `experimental.themes` in `plugin.json`. They
appear in `/theme` automatically when the plugin is enabled. No hooks are used.

## Flavours

All four official Catppuccin flavours are shipped: Latte, Frappé, Macchiato, and
Mocha. Latte is light (`"base": "light"`); the other three are dark.

## Single source of truth — the generator

The four `themes/*.json` files are **generated**, not hand-written. Editing them
directly is a mistake — the plugin's script-tests fail if the committed files
drift from `scripts/generate-themes.mjs` output.

The generator holds one shared role→palette-name map (every Claude Code UI role
mapped to a canonical Catppuccin color) plus the four official 24-color palettes.
Each flavour reuses the same role map; only the palette swaps. To change a role
mapping or a palette value, edit the generator and run
`node scripts/generate-themes.mjs`.

## Catppuccin palette source

All named colors are taken from the official Catppuccin spec
(https://catppuccin.com/palette). Do not approximate or deviate from the
official hex values for named palette entries.

## Diff colors

The diff tokens (`diffAdded`, `diffRemoved`, etc.) are the only colors not taken
directly from a Catppuccin named palette, because Claude Code's theme system
does not support alpha channels — they must be opaque tints.

- **Mocha** uses hand-tuned values, kept as the reference.
- **Dark flavours** (Frappé, Macchiato) derive their diff tints from Mocha's
  per-channel offset from its base, re-anchored on each flavour's own base. By
  construction this reproduces Mocha's exact values for Mocha itself.
- **Latte** (light) instead tints its light base toward the flavour's green/red
  at fixed low opacities.

This derivation lives in `diffColors()` in the generator.
