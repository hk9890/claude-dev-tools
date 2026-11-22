#!/usr/bin/env python3
"""Copy the design tokens of assets/shared/tokens.css into references/visualize-template.html.

Usage:
    sync-template-tokens.py [--check] [<tokens.css> <template.html>]

The template renders from file:// with no network, so it cannot @import the tokens and
holds a copy instead: every line of tokens.css from its first `:root {` on, indented to
the template's <style> level, up to the template's "Page-mode chrome" comment. With
--check, write nothing and exit 1 where the copy differs. The paths default to this
plugin's own files.
"""

import os
import sys

PLUGIN = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
INDENT = "    "
START = INDENT + ":root {"
END_PREFIX = INDENT + "/* ── Page-mode chrome"


def token_block(tokens_text):
    lines = tokens_text.splitlines()
    first = lines.index(":root {")
    return [INDENT + ln if ln else ln for ln in lines[first:]] + [""]


def synced(template_text, block):
    lines = template_text.splitlines()
    start = lines.index(START)
    end = next(i for i, ln in enumerate(lines) if ln.startswith(END_PREFIX))
    return "\n".join(lines[:start] + block + lines[end:]) + "\n"


def main():
    args = sys.argv[1:]
    check = "--check" in args
    paths = [a for a in args if a != "--check"]
    if len(paths) not in (0, 2):
        sys.exit(__doc__)
    tokens, template = paths or [
        os.path.join(PLUGIN, "assets", "shared", "tokens.css"),
        os.path.join(PLUGIN, "references", "visualize-template.html"),
    ]
    with open(tokens, encoding="utf-8") as fh:
        block = token_block(fh.read())
    with open(template, encoding="utf-8") as fh:
        current = fh.read()
    wanted = synced(current, block)
    if wanted == current:
        return
    if check:
        sys.exit(f"{template}: the token copy differs from {tokens}; run {os.path.basename(__file__)} to sync it")
    with open(template, "w", encoding="utf-8") as fh:
        fh.write(wanted)
    print(f"synced {template}")


if __name__ == "__main__":
    main()
