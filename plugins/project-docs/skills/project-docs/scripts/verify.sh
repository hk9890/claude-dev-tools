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

USAGE="Usage: verify.sh [--quick] <repo-root>

  --quick   Skip docs/*.md route validation; only check CLAUDE.md + AGENTS.md
            references. Faster on large repos but misses broken links in docs/."

# ── helpers ──────────────────────────────────────────────────────────────────

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

section() { printf '\n=== %s ===\n' "$*"; }

# ── argument handling ─────────────────────────────────────────────────────────

INCLUDE_DOCS=1   # default: validate docs/*.md routes too

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quick)   INCLUDE_DOCS=0; shift ;;
    -h|--help) printf '%s\n' "$USAGE"; exit 0 ;;
    --)        shift; break ;;
    -*)        die "Unknown option: $1"$'\n'"$USAGE" ;;
    *)         break ;;
  esac
done

[[ $# -eq 1 ]] || die "$USAGE"
REPO_ROOT="$1"
[[ -d "$REPO_ROOT" ]] || die "repo-root '$REPO_ROOT' is not a directory"

VALIDATE_FLAGS=""
[[ "$INCLUDE_DOCS" -eq 1 ]] && VALIDATE_FLAGS="--include-docs"

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
if python3 "$SCRIPT_DIR/validate-routes.py" "$REPO_ROOT" $VALIDATE_FLAGS; then
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

# Injected blocks (auto-generated content from external tools in steering docs)
injected = data.get('injected_blocks', [])
if injected:
    for b in injected:
        print(\"WARNING: injected block in {}: '{}' at lines {}-{} ({} lines) -- steering docs should be hand-authored\".format(
            b['file'], b['name'], b['begin_line'], b['end_line'], b['lines']))
    warned = True

if not warned:
    print('No soft warnings.')
"
fi

# ── Check 4: plugins/**/*.md relative-link integrity (hard) ──────────────────

section "Check 4: plugins/**/*.md link integrity"
PLUGINS_DIR="$REPO_ROOT/plugins"
if [[ ! -d "$PLUGINS_DIR" ]]; then
  printf 'SKIP: no plugins/ directory found\n'
else
  PLUGINS_RESULT=$(python3 - "$REPO_ROOT" "$SCRIPT_DIR/validate-routes.py" <<'PYEOF'
import importlib.util, os, sys

repo_root = sys.argv[1]
vr_path = sys.argv[2]

spec = importlib.util.spec_from_file_location("validate_routes", vr_path)
vr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vr)

plugins_dir = os.path.join(repo_root, "plugins")
files_to_check = []
for dirpath, dirnames, filenames in os.walk(plugins_dir):
    dirnames.sort()
    for fn in sorted(filenames):
        if fn.endswith(".md"):
            files_to_check.append(os.path.join(dirpath, fn))

all_refs = []
for filepath in files_to_check:
    content = vr.load_file(filepath)
    if content is None:
        continue
    refs = vr.extract_references(filepath, content)
    all_refs.extend(refs)

unresolved = []
for ref in all_refs:
    ok, reason = vr.resolve_reference(ref, repo_root)
    if not ok:
        # Treat directory targets without anchors as resolved (links to directories
        # are valid navigation targets on GitHub — they render the directory listing).
        if ref["anchor"] is None:
            target = os.path.normpath(
                os.path.join(os.path.dirname(ref["source_file"]), ref["raw_path"])
            )
            if os.path.isdir(target):
                continue
        unresolved.append(f"{ref['source_file']}:{ref['line']}: {ref['ref']}  [{reason}]")

print(f"Scanned {len(files_to_check)} .md file(s) under plugins/, checked {len(all_refs)} reference(s).")
for line in unresolved:
    print(f"UNRESOLVED: {line}")
sys.exit(1 if unresolved else 0)
PYEOF
  )
  PLUGINS_EXIT=$?
  printf '%s\n' "$PLUGINS_RESULT"
  if [[ "$PLUGINS_EXIT" -eq 0 ]]; then
    printf 'RESULT: PASS\n'
  else
    printf 'RESULT: FAIL\n'
    HARD_FAIL=$((HARD_FAIL + 1))
  fi
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
