# style plugin — rules and design decisions

## Scope

This plugin is strictly visual. It ships color themes only. No commands, skills, agents, hooks, or output styles.

## Theme delivery mechanism

Themes are distributed natively via `experimental.themes` in `plugin.json`. They appear in `/theme` automatically when the plugin is enabled. No hooks are used.

## Catppuccin Mocha palette source

All colors are taken from the official Catppuccin Mocha spec (https://catppuccin.com/palette). Do not approximate or deviate from the official hex values for named palette entries.

## Diff colors

The diff tokens (`diffAdded`, `diffRemoved`, etc.) use custom dark-tinted hex values derived from the Mocha Red/Green, since Claude Code's theme system does not support alpha channels. These are the only colors in the theme not taken directly from the Catppuccin named palette.

## One theme only

Only Catppuccin Mocha is shipped. Do not add other Catppuccin flavors (Latte, Frappé, Macchiato) without explicit request.
