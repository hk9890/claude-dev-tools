#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: new-ar-task.sh <epic-id> [--extra-criterion=\"...\"]..." >&2
  exit 2
}

if [[ $# -eq 0 ]]; then
  usage
fi

EPIC_ID="$1"
shift

EXTRA_CRITERIA=()
for arg in "$@"; do
  case "$arg" in
    --extra-criterion=*)
      EXTRA_CRITERIA+=("${arg#--extra-criterion=}")
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage
      ;;
  esac
done

# Read epic metadata
EPIC_JSON=$(bd show "$EPIC_ID" --json)
EPIC_TYPE=$(echo "$EPIC_JSON" | jq -r '.[0].issue_type // empty')
EPIC_TITLE=$(echo "$EPIC_JSON" | jq -r '.[0].title // empty')
EPIC_PRIORITY=$(echo "$EPIC_JSON" | jq -r '.[0].priority // empty')

if [[ "$EPIC_TYPE" != "epic" ]]; then
  echo "Error: '$EPIC_ID' is type '$EPIC_TYPE', not 'epic'" >&2
  exit 1
fi

# Build body in a temp file
TMPFILE=$(mktemp /tmp/new-ar-task-XXXXXX.md)
trap 'rm -f "$TMPFILE"' EXIT

cat > "$TMPFILE" <<'BODY'
## Description
Verify the epic outcome before closure.

## Acceptance Criteria
- [ ] All child implementation tasks closed
- [ ] Required tests/checks completed and passing
- [ ] No unresolved critical defects
- [ ] Follow-up issues filed for non-blocking gaps
BODY

for criterion in "${EXTRA_CRITERIA[@]}"; do
  echo "- [ ] $criterion" >> "$TMPFILE"
done

# Create the AR task
AR_JSON=$(bd create --title="Acceptance Review: $EPIC_TITLE" --type=task --priority="$EPIC_PRIORITY" --body-file "$TMPFILE" --json)
AR_ID=$(echo "$AR_JSON" | jq -r '.id // empty')

# Link as parent-child dep (redirect output so only AR_ID goes to stdout)
bd dep add "$AR_ID" "$EPIC_ID" --type=parent-child >&2

echo "$AR_ID"
