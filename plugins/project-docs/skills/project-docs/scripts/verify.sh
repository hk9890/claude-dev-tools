#!/usr/bin/env bash
# verify.sh — Phase 7 (Verify) orchestrator for project-docs lifecycle.
#
# Usage: verify.sh <repo-root>
#
# Runs all checks, prints a summary, and exits non-zero if any hard check fails.
# Soft warnings (missing canonical docs, hollow docs, non-canonical docs,
# location violations) are printed but do NOT flip the exit code.
#
# Exit codes:
#   0 — all hard checks passed (soft warnings may have been emitted)
#   1 — one or more hard checks failed

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

USAGE="Usage: verify.sh <repo-root>"

# ── helpers ──────────────────────────────────────────────────────────────────

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

section() { printf '\n=== %s ===\n' "$*"; }

# ── argument handling ─────────────────────────────────────────────────────────

[[ $# -eq 1 ]] || die "$USAGE"
REPO_ROOT="$1"
[[ -d "$REPO_ROOT" ]] || die "repo-root '$REPO_ROOT' is not a directory"

# ── state ─────────────────────────────────────────────────────────────────────

HARD_FAIL=0   # incremented on each hard-check failure

# ── Check 1: CLAUDE.md first-line invariant (hard) ───────────────────────────

section "Check 1: CLAUDE.md invariant (claude-md.sh check)"
if "$SCRIPT_DIR/claude-md.sh" check "$REPO_ROOT"; then
  printf 'RESULT: PASS\n'
else
  printf 'RESULT: FAIL\n'
  HARD_FAIL=$((HARD_FAIL + 1))
fi

# ── Check 2: route resolution (hard) ─────────────────────────────────────────

section "Check 2: route resolution (validate-routes.py)"
if python3 "$SCRIPT_DIR/validate-routes.py" "$REPO_ROOT"; then
  printf 'RESULT: PASS\n'
else
  printf 'RESULT: FAIL\n'
  HARD_FAIL=$((HARD_FAIL + 1))
fi

# ── Check 3: doc inventory soft warnings ─────────────────────────────────────

section "Check 3: doc inventory (inventory.py — soft warnings only)"
INV_JSON=$(python3 "$SCRIPT_DIR/inventory.py" "$REPO_ROOT") || {
  printf 'ERROR: inventory.py failed unexpectedly\n' >&2
  HARD_FAIL=$((HARD_FAIL + 1))
  INV_JSON=""
}

if [[ -n "$INV_JSON" ]]; then
  printf '%s\n' "$INV_JSON" | python3 -c "
import json, sys

data = json.loads(sys.stdin.read())
warned = False

# Missing canonical docs
missing = [name for name, entry in data.get('canonical', {}).items() if not entry['present']]
if missing:
    print('WARNING: {} canonical doc(s) missing: {}'.format(len(missing), ', '.join(missing)))
    warned = True

# Hollow docs (present but non_heading_lines == 0)
hollow = [
    name for name, entry in data.get('canonical', {}).items()
    if entry['present'] and entry.get('non_heading_lines') == 0
]
if hollow:
    print('WARNING: {} canonical doc(s) appear hollow (no content lines): {}'.format(len(hollow), ', '.join(hollow)))
    warned = True

# Non-canonical docs in docs/ (consolidation candidates)
non_canonical = data.get('non_canonical_docs', [])
if non_canonical:
    paths = [e['path'] for e in non_canonical]
    print('WARNING: {} non-canonical doc(s) in docs/ (consolidation candidates): {}'.format(len(non_canonical), ', '.join(paths)))
    warned = True

# Location violations
violations = data.get('location_violations', [])
if violations:
    for v in violations:
        print('WARNING: location violation -- {}: found at {}, expected at {}'.format(v['file'], v['found_at'], v['expected_at']))
    warned = True

if not warned:
    print('No soft warnings.')
"
fi

# ── Final summary ─────────────────────────────────────────────────────────────

printf '\n'
if [[ "$HARD_FAIL" -eq 0 ]]; then
  printf '=== VERIFY: PASS (all hard checks passed) ===\n'
  exit 0
else
  printf '=== VERIFY: FAIL (%d hard check(s) failed) ===\n' "$HARD_FAIL"
  exit 1
fi
