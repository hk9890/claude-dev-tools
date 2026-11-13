#!/usr/bin/env bash
# test-plugin-icons.sh — every plugin's committed icon is the one generate-plugin-icons.py writes.
#
# The generator runs in a scratch copy of the repo root, so the test changes nothing in the
# checkout. It fails on a plugin with no icon, an icon edited by hand, and a plugin the
# generator has no monogram, glyph or colour for. Icons compare by chunk list, header and
# decompressed scanlines: the compressed bytes depend on the zlib build that wrote them. An
# optimizer that re-filters the rows fails the test; regenerate the icons after one.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

PASS=0
FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

same_pixels() {
  python3 -I - "$1" "$2" <<'PY'
import sys
import zlib


def image(path):
    data, chunks, at = open(path, 'rb').read(), {}, 8
    while at < len(data):
        size = int.from_bytes(data[at:at + 4], 'big')
        kind = data[at + 4:at + 8]
        chunks[kind] = chunks.get(kind, b'') + data[at + 8:at + 8 + size]
        at += 12 + size
    return sorted(chunks), chunks[b'IHDR'], zlib.decompress(chunks[b'IDAT'])


sys.exit(0 if image(sys.argv[1]) == image(sys.argv[2]) else 1)
PY
}

mkdir -p "$SCRATCH/scripts" "$SCRATCH/.claude-plugin"
cp "$REPO_ROOT/scripts/generate-plugin-icons.py" "$SCRATCH/scripts/"
cp "$REPO_ROOT/.claude-plugin/marketplace.json" "$SCRATCH/.claude-plugin/"
while IFS= read -r source; do
  mkdir -p "$SCRATCH/$source/.claude-plugin"
done < <(jq -r '.plugins[].source' "$REPO_ROOT/.claude-plugin/marketplace.json")

if output="$(python3 "$SCRATCH/scripts/generate-plugin-icons.py" 2>&1)"; then
  ok "the generator knows every plugin"
else
  fail "the generator stopped: $output"
  printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"
  exit 1
fi

while IFS= read -r source; do
  icon="$source/.claude-plugin/icon.png"
  if [[ ! -f "$REPO_ROOT/$icon" ]]; then
    fail "$icon is missing; run python3 scripts/generate-plugin-icons.py"
  elif [[ -f "$SCRATCH/$icon" ]] && same_pixels "$REPO_ROOT/$icon" "$SCRATCH/$icon"; then
    ok "$icon matches the generator"
  else
    fail "$icon differs from the generator; run python3 scripts/generate-plugin-icons.py"
  fi
done < <(jq -r '.plugins[].source' "$REPO_ROOT/.claude-plugin/marketplace.json")

printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
