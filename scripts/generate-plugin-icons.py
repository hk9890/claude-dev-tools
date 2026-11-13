#!/usr/bin/env python3
"""Write plugins/<plugin>/.claude-plugin/icon.png for every plugin in marketplace.json.

Each icon is a 512 px rounded tile in its marketplace category's colour, with a
two-letter monogram in a 5x7 pixel font. Stdlib only, so it runs wherever the
repo's other scripts do. Usage: python3 scripts/generate-plugin-icons.py
"""

import json
import struct
import sys
import zlib
from pathlib import Path

SIZE = 512
CORNER_RADIUS = 96
PIXEL = 32

# Catppuccin Mocha: crust for the monogram, one accent per category.
INK = (0x1E, 0x1E, 0x2E)
CATEGORY_COLORS = {
    'workflow': (0x89, 0xB4, 0xFA),
    'code-quality': (0xCB, 0xA6, 0xF7),
    'theme': (0xFA, 0xB3, 0x87),
    'style': (0xA6, 0xE3, 0xA1),
}

MONOGRAMS = {
    'tasks': 'TK',
    'project-review': 'PR',
    'project-execute': 'PX',
    'challenge': 'CH',
    'github-releases': 'GR',
    'catppuccin-themes': 'CT',
    'keep-awake-linux': 'KA',
    'html-visualization': 'HV',
    'project-auto-work': 'PA',
    'instruction-writing': 'IW',
    'plain-english-output-style': 'PE',
    'worktree-flow': 'WF',
    'revier': 'RV',
    'werft': 'WT',
}

GLYPHS = {
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'G': ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
    'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
}


def monogram_cells(letters):
    rows = []
    for row in range(7):
        rows.append('0'.join(GLYPHS[letter][row] for letter in letters))
    return rows


def is_inside_tile(x, y):
    nearest_x = min(max(x, CORNER_RADIUS), SIZE - 1 - CORNER_RADIUS)
    nearest_y = min(max(y, CORNER_RADIUS), SIZE - 1 - CORNER_RADIUS)
    return (x - nearest_x) ** 2 + (y - nearest_y) ** 2 <= CORNER_RADIUS ** 2


def render(letters, color):
    cells = monogram_cells(letters)
    left = (SIZE - len(cells[0]) * PIXEL) // 2
    top = (SIZE - len(cells) * PIXEL) // 2
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)
        for x in range(SIZE):
            if not is_inside_tile(x, y):
                raw += b'\x00\x00\x00\x00'
                continue
            column, row = (x - left) // PIXEL, (y - top) // PIXEL
            is_ink = 0 <= x - left and 0 <= y - top and row < len(cells) and column < len(cells[0]) and cells[row][column] == '1'
            raw += bytes(INK if is_ink else color) + b'\xff'
    return png(bytes(raw))


def png(raw):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    header = struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def main():
    root = Path(__file__).resolve().parent.parent
    plugins = json.loads((root / '.claude-plugin' / 'marketplace.json').read_text())['plugins']
    no_monogram = [plugin['name'] for plugin in plugins if plugin['name'] not in MONOGRAMS]
    if no_monogram:
        sys.exit(f'No monogram for: {", ".join(no_monogram)}. Add one to MONOGRAMS.')
    no_color = sorted({plugin['category'] for plugin in plugins} - CATEGORY_COLORS.keys())
    if no_color:
        sys.exit(f'No colour for category: {", ".join(no_color)}. Add one to CATEGORY_COLORS.')
    for plugin in plugins:
        target = root / plugin['source'] / '.claude-plugin' / 'icon.png'
        target.write_bytes(render(MONOGRAMS[plugin['name']], CATEGORY_COLORS[plugin['category']]))
        print(target.relative_to(root))


if __name__ == '__main__':
    main()
