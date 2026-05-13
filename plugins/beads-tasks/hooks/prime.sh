#!/bin/bash
set -euo pipefail

# Only inject when beads is active for this project
command -v bd >/dev/null 2>&1 || exit 0
[ -d "${CLAUDE_PROJECT_DIR:-$PWD}/.beads" ] || exit 0

PROMPT_FILE="$CLAUDE_PLUGIN_ROOT/hooks/prime.md"
[ -f "$PROMPT_FILE" ] || exit 0
jq -Rs '{"systemMessage": .}' < "$PROMPT_FILE"
