// generate-themes.mjs — emit the four Catppuccin flavour themes for Claude Code.
//
// One role->palette map is shared by every flavour; only the 24-colour palette
// swaps per flavour. This mirrors the upstream Catppuccin port structure and
// keeps the four theme files impossible to drift out of sync by hand.
//
// Run:  node scripts/generate-themes.mjs
// The committed themes/*.json must always equal this script's output; the
// plugin's script-tests enforce that (drift check).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Defaults to the plugin's themes/ dir; the drift test points it elsewhere.
const outDir = process.env.THEMES_OUT_DIR || join(root, "themes");

// Official Catppuccin palettes — https://catppuccin.com/palette
// Do not approximate; these are the canonical named hex values per flavour.
const palettes = {
  latte: {
    rosewater: "#dc8a78", flamingo: "#dd7878", pink: "#ea76cb", mauve: "#8839ef",
    red: "#d20f39", maroon: "#e64553", peach: "#fe640b", yellow: "#df8e1d",
    green: "#40a02b", teal: "#179299", sky: "#04a5e5", sapphire: "#209fb5",
    blue: "#1e66f5", lavender: "#7287fd", text: "#4c4f69", subtext1: "#5c5f77",
    subtext0: "#6c6f85", overlay2: "#7c7f93", overlay1: "#8c8fa1", overlay0: "#9ca0b0",
    surface2: "#acb0be", surface1: "#bcc0cc", surface0: "#ccd0da", base: "#eff1f5",
    mantle: "#e6e9ef", crust: "#dce0e8",
  },
  frappe: {
    rosewater: "#f2d5cf", flamingo: "#eebebe", pink: "#f4b8e4", mauve: "#ca9ee6",
    red: "#e78284", maroon: "#ea999c", peach: "#ef9f76", yellow: "#e5c890",
    green: "#a6d189", teal: "#81c8be", sky: "#99d1db", sapphire: "#85c1dc",
    blue: "#8caaee", lavender: "#babbf1", text: "#c6d0f5", subtext1: "#b5bfe2",
    subtext0: "#a5adce", overlay2: "#949cbb", overlay1: "#838ba7", overlay0: "#737994",
    surface2: "#626880", surface1: "#51576d", surface0: "#414559", base: "#303446",
    mantle: "#292c3c", crust: "#232634",
  },
  macchiato: {
    rosewater: "#f4dbd6", flamingo: "#f0c6c6", pink: "#f5bde6", mauve: "#c6a0f6",
    red: "#ed8796", maroon: "#ee99a0", peach: "#f5a97f", yellow: "#eed49f",
    green: "#a6da95", teal: "#8bd5ca", sky: "#91d7e3", sapphire: "#7dc4e4",
    blue: "#8aadf4", lavender: "#b7bdf8", text: "#cad3f5", subtext1: "#b8c0e0",
    subtext0: "#a5adcb", overlay2: "#939ab7", overlay1: "#8087a2", overlay0: "#6e738d",
    surface2: "#5b6078", surface1: "#494d64", surface0: "#363a4f", base: "#24273a",
    mantle: "#1e2030", crust: "#181926",
  },
  mocha: {
    rosewater: "#f5e0dc", flamingo: "#f2cdcd", pink: "#f5c2e7", mauve: "#cba6f7",
    red: "#f38ba8", maroon: "#eba0ac", peach: "#fab387", yellow: "#f9e2af",
    green: "#a6e3a1", teal: "#94e2d5", sky: "#89dceb", sapphire: "#74c7ec",
    blue: "#89b4fa", lavender: "#b4befe", text: "#cdd6f4", subtext1: "#bac2de",
    subtext0: "#a6adc8", overlay2: "#9399b2", overlay1: "#7f849c", overlay0: "#6c7086",
    surface2: "#585b70", surface1: "#45475a", surface0: "#313244", base: "#1e1e2e",
    mantle: "#181825", crust: "#11111b",
  },
};

const flavors = {
  latte: { display: "Catppuccin Latte", base: "light" },
  frappe: { display: "Catppuccin Frappé", base: "dark" },
  macchiato: { display: "Catppuccin Macchiato", base: "dark" },
  mocha: { display: "Catppuccin Mocha", base: "dark" },
};

// Every Claude Code UI role -> canonical palette entry. The six diff-background
// tokens are the sole exception and are computed separately (see diffColors).
// Key names must be tokens Claude Code actually reads — an invented name is
// inert config that no test would otherwise catch, so the script-tests pin the
// accepted set. Adding a role here means adding it there too.
const roleMap = {
  claude: "mauve",
  claudeShimmer: "pink",
  text: "text",
  inverseText: "base",
  inactive: "overlay0",
  inactiveShimmer: "overlay1",
  subtle: "surface1",
  suggestion: "mauve",
  permission: "lavender",
  permissionShimmer: "mauve",
  remember: "lavender",
  success: "green",
  error: "red",
  warning: "yellow",
  warningShimmer: "peach",
  merged: "teal",
  promptBorder: "mauve",
  promptBorderShimmer: "pink",
  planMode: "teal",
  autoAccept: "green",
  bashBorder: "peach",
  ide: "sky",
  fastMode: "yellow",
  fastModeShimmer: "peach",
  userMessageBackground: "surface0",
  userMessageBackgroundHover: "surface1",
  bashMessageBackgroundColor: "mantle",
  memoryBackgroundColor: "crust",
  selectionBg: "surface2",
  rate_limit_fill: "mauve",
  rate_limit_empty: "surface1",
  briefLabelYou: "lavender",
  briefLabelClaude: "mauve",
  red_FOR_SUBAGENTS_ONLY: "red",
  blue_FOR_SUBAGENTS_ONLY: "blue",
  green_FOR_SUBAGENTS_ONLY: "green",
  yellow_FOR_SUBAGENTS_ONLY: "yellow",
  purple_FOR_SUBAGENTS_ONLY: "mauve",
  orange_FOR_SUBAGENTS_ONLY: "peach",
  pink_FOR_SUBAGENTS_ONLY: "pink",
  cyan_FOR_SUBAGENTS_ONLY: "sky",
  rainbow_red: "red",
  rainbow_red_shimmer: "maroon",
  rainbow_orange: "peach",
  rainbow_orange_shimmer: "rosewater",
  rainbow_yellow: "yellow",
  rainbow_yellow_shimmer: "peach",
  rainbow_green: "green",
  rainbow_green_shimmer: "teal",
  rainbow_blue: "blue",
  rainbow_blue_shimmer: "sapphire",
  rainbow_indigo: "lavender",
  rainbow_indigo_shimmer: "blue",
  rainbow_violet: "mauve",
  rainbow_violet_shimmer: "pink",
};

// Emission order for the overrides block. Keeps diff tokens interleaved exactly
// where they sit in the theme so output is stable across regenerations.
const overrideOrder = [
  "claude", "claudeShimmer", "text", "inverseText", "inactive", "inactiveShimmer",
  "subtle", "suggestion", "permission", "permissionShimmer", "remember", "success",
  "error", "warning", "warningShimmer", "merged", "promptBorder", "promptBorderShimmer",
  "planMode", "autoAccept", "bashBorder", "ide", "fastMode", "fastModeShimmer",
  "diffAdded", "diffRemoved", "diffAddedDimmed", "diffRemovedDimmed", "diffAddedWord",
  "diffRemovedWord", "userMessageBackground", "userMessageBackgroundHover",
  "bashMessageBackgroundColor", "memoryBackgroundColor",
  "selectionBg", "rate_limit_fill", "rate_limit_empty", "briefLabelYou", "briefLabelClaude",
  "red_FOR_SUBAGENTS_ONLY", "blue_FOR_SUBAGENTS_ONLY", "green_FOR_SUBAGENTS_ONLY",
  "yellow_FOR_SUBAGENTS_ONLY", "purple_FOR_SUBAGENTS_ONLY", "orange_FOR_SUBAGENTS_ONLY",
  "pink_FOR_SUBAGENTS_ONLY", "cyan_FOR_SUBAGENTS_ONLY", "rainbow_red", "rainbow_red_shimmer",
  "rainbow_orange", "rainbow_orange_shimmer", "rainbow_yellow", "rainbow_yellow_shimmer",
  "rainbow_green", "rainbow_green_shimmer", "rainbow_blue", "rainbow_blue_shimmer",
  "rainbow_indigo", "rainbow_indigo_shimmer", "rainbow_violet", "rainbow_violet_shimmer",
];

// --- colour helpers ---------------------------------------------------------

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) => "#" + rgb.map((c) => clamp(c).toString(16).padStart(2, "0")).join("");
// Opaque approximation of fg drawn at opacity a over bg (no alpha in the schema).
const blend = (fg, bg, a) => fg.map((c, i) => bg[i] + a * (c - bg[i]));

// Diff backgrounds — the one set of colours NOT taken from the named palette,
// since the theme system has no alpha channel. Mocha's six values were hand
// tuned; we capture them as per-channel offsets from Mocha's base and re-anchor
// those offsets on each dark flavour's own base (so Mocha reproduces exactly).
// Latte is light, so instead we tint its light base toward green/red.
const MOCHA_DIFF = {
  diffAdded: "#1e3a2a", diffRemoved: "#3a1e22",
  diffAddedDimmed: "#253330", diffRemovedDimmed: "#2e2228",
  diffAddedWord: "#3d6850", diffRemovedWord: "#683040",
};
const DIFF_LATTE_ALPHA = {
  diffAdded: 0.16, diffRemoved: 0.16,
  diffAddedDimmed: 0.09, diffRemovedDimmed: 0.09,
  diffAddedWord: 0.34, diffRemovedWord: 0.34,
};

function diffColors(flavor, palette) {
  const base = hexToRgb(palette.base);
  if (flavors[flavor].base === "light") {
    const green = hexToRgb(palette.green);
    const red = hexToRgb(palette.red);
    const out = {};
    for (const token of Object.keys(DIFF_LATTE_ALPHA)) {
      const fg = token.includes("Added") ? green : red;
      out[token] = rgbToHex(blend(fg, base, DIFF_LATTE_ALPHA[token]));
    }
    return out;
  }
  const mochaBase = hexToRgb(palettes.mocha.base);
  const out = {};
  for (const [token, hex] of Object.entries(MOCHA_DIFF)) {
    const offset = hexToRgb(hex).map((c, i) => c - mochaBase[i]);
    out[token] = rgbToHex(base.map((c, i) => c + offset[i]));
  }
  return out;
}

// --- build ------------------------------------------------------------------

function buildTheme(flavor) {
  const palette = palettes[flavor];
  const diffs = diffColors(flavor, palette);
  const overrides = {};
  for (const key of overrideOrder) {
    if (key in diffs) {
      overrides[key] = diffs[key];
    } else {
      overrides[key] = palette[roleMap[key]];
    }
  }
  return { name: flavors[flavor].display, base: flavors[flavor].base, overrides };
}

await mkdir(outDir, { recursive: true });

for (const flavor of Object.keys(flavors)) {
  const theme = buildTheme(flavor);
  const file = join(outDir, `catppuccin-${flavor}.json`);
  await writeFile(file, `${JSON.stringify(theme, null, 2)}\n`);
}

console.log(`Generated ${Object.keys(flavors).length} Catppuccin themes into ${outDir}`);
