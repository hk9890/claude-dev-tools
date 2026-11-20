#!/usr/bin/env bash
# test-canonical-docs.sh — the canonical doc taxonomy spans three plugins.
#
# `instruction-writing` owns the standard (the topic list, each file's ownership contract,
# a worked example per file); `project-review` owns the reviewer that measures against it
# (manifest.py's canonical lists, history.py's use-case vocabulary). Nothing in either
# plugin can import the other, so a new canonical doc registered in one and forgotten in
# the other classifies as non-standard at review time and its example never gets written.
# These tests pin the halves together. A topic is a file (`OVERVIEW.md`) or a tree
# (`decisions/`, trailing slash) whose records are the files in it: a tree's example is a
# folder that holds at least one numbered record, and it has no use case: its route fires on
# edits to the paths its records govern, which no history label isolates.
#
# project-exec-init's earned-topic table is deliberately NOT pinned here: whether a repo
# has earned a topic doc is a judgement, and a row asserting one exists would only restate
# the list. docs/CODING.md lists it as a manual step.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

STANDARD="$REPO_ROOT/plugins/instruction-writing/skills/writing-project-docs"
SETUP_MD="$STANDARD/references/project-setup.md"
EXAMPLES="$STANDARD/examples/docs"
MANIFEST="$REPO_ROOT/plugins/project-review/skills/project-review-docs/scripts/manifest.py"
HISTORY="$REPO_ROOT/plugins/project-review/skills/project-review-docs/scripts/history.py"

PASS=0
FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then ok "$label"; else
    fail "$label — expected $(printf '%q' "$expected"), got $(printf '%q' "$actual")"; fi
}

for f in "$SETUP_MD" "$MANIFEST" "$HISTORY"; do
  [[ -f "$f" ]] || { printf 'FAIL: missing %s\n' "$f" >&2; exit 1; }
done

# manifest.py is the machine-readable copy of the taxonomy; read the list from it rather
# than restating it here, so this suite tracks a rename instead of failing on one.
DOCS=$(python3 -c "
import importlib.util
spec = importlib.util.spec_from_file_location('m', '$MANIFEST')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(' '.join(m.CANONICAL_DOCS))
") || { printf 'FAIL: cannot load CANONICAL_DOCS from manifest.py\n' >&2; exit 1; }

[[ -n "$DOCS" ]] || { printf 'FAIL: CANONICAL_DOCS is empty\n' >&2; exit 1; }

# The docs review sends each batch agent to the ownership block headed by the file's own
# path (`docs/CODING.md`, `README.md`, `docs/decisions/`), so a block is found by that path.
# Prints which of the fields named after `$1` the block headed `$1` lacks, or "complete".
contract_gaps() {
  python3 - "$SETUP_MD" "$@" <<'PY'
import re, sys
setup, heading, required = sys.argv[1], sys.argv[2], sys.argv[3:]
fields, cur, in_section = set(), None, False
for ln in open(setup, encoding='utf-8').read().splitlines():
    if ln.startswith('## '):
        in_section = ln.startswith('## File ownership boundaries')
        continue
    if not in_section:
        continue
    m = re.match(r'^###\s+`([^`]+)`', ln)
    if m:
        cur = m.group(1)
        continue
    f = re.match(r'^-\s+\*\*(Audience|Inside|Not inside)\*\*:\s*\S', ln)
    if f and cur == heading:
        fields.add(f.group(1))
missing = [k for k in required if k not in fields]
print(','.join(missing) if missing else 'complete')
PY
}

# 1. The standard's topic-set code block lists exactly the same names, in the same order,
#    the tree included.
SETUP_LIST=$(python3 -c "
import re
s = open('$SETUP_MD', encoding='utf-8').read()
block = re.search(r'## Canonical topic set\s*\n+\`\`\`text\n(.*?)\`\`\`', s, re.S)
print(' '.join(re.findall(r'^\s+(\S+(?:\.md|/))\s*\$', block.group(1), re.M)) if block else '')
")
assert_eq "topic set: project-setup.md lists the same docs as manifest.py" "$DOCS" "$SETUP_LIST"

# 2. Every canonical doc has an ownership block headed by its path, and a worked example.
for name in $DOCS; do
  assert_eq "contract: docs/$name has Audience, Inside and Not inside" "complete" "$(contract_gaps "docs/$name" Audience Inside 'Not inside')"

  if [[ "$name" == */ ]]; then
    if compgen -G "$EXAMPLES/${name}[0-9][0-9][0-9][0-9]-*.md" >/dev/null; then ok "example: examples/docs/$name holds a record"
    else fail "example: examples/docs/$name holds no NNNN-slug.md record — every canonical tree carries a worked example"; fi
  elif [[ -f "$EXAMPLES/$name" ]]; then ok "example: examples/docs/$name exists"
  else fail "example: examples/docs/$name is missing — every canonical doc carries a worked example"; fi
done

ROOT_DOCS=$(python3 -c "
import importlib.util
spec = importlib.util.spec_from_file_location('m', '$MANIFEST')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
# CLAUDE.md is checked by the manifest alone and never reaches a batch agent.
print(' '.join(n for n in m.CANONICAL_ROOT + m.OPTIONAL_CANONICAL_ROOT if n != 'CLAUDE.md'))
") || { printf 'FAIL: cannot load the root canonical lists from manifest.py\n' >&2; exit 1; }
for name in $ROOT_DOCS; do
  assert_eq "contract: $name has Audience, Inside and Not inside" "complete" "$(contract_gaps "$name" Audience Inside 'Not inside')"
done

# 2b. Every personal file manifest.py excludes is a file the standard names, with its own
#     Inside and Not inside — else a rename on one side reviews personal notes as project docs.
#     Each legacy name moves to one of those files.
PERSONAL=$(python3 -c "
import importlib.util
spec = importlib.util.spec_from_file_location('m', '$MANIFEST')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
assert set(m.LEGACY_PERSONAL_LOCAL.values()) <= set(m.PERSONAL_LOCAL), 'a legacy name moves to a file PERSONAL_LOCAL lacks'
print(' '.join(m.PERSONAL_LOCAL))
") || { printf 'FAIL: cannot load PERSONAL_LOCAL from manifest.py, or a legacy name moves outside it\n' >&2; exit 1; }
[[ -n "$PERSONAL" ]] || { printf 'FAIL: PERSONAL_LOCAL is empty\n' >&2; exit 1; }
for name in $PERSONAL; do
  assert_eq "personal file: project-setup.md has an Inside and Not inside block for $name" "complete" \
    "$(contract_gaps "$name" Inside 'Not inside')"
done

# 3. Every canonical topic file is the target of exactly one review use case, and a tree is
#    the target of none: its route fires on edits to the paths its records govern, which no
#    history label isolates.
HISTORY_TARGETS=$(python3 -c "
import importlib.util
spec = importlib.util.spec_from_file_location('h', '$HISTORY')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
print(' '.join(sorted(v.split('/')[-1] for v in h.USE_CASE_DOCS.values())))
")
EXPECTED_TARGETS=$(printf '%s\n' "$DOCS" | tr ' ' '\n' | grep -v '/$' | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')
assert_eq "use cases: history.py covers every canonical topic file exactly once, and no tree" "$EXPECTED_TARGETS" "$HISTORY_TARGETS"

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
