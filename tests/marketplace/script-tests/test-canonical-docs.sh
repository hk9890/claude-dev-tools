#!/usr/bin/env bash
# test-canonical-docs.sh — the canonical doc taxonomy spans three plugins.
#
# `instruction-writing` owns the standard (the topic list, each file's ownership contract,
# a worked example per file); `project-review` owns the reviewer that measures against it
# (manifest.py's canonical lists, history.py's use-case vocabulary). Nothing in either
# plugin can import the other, so a new canonical doc registered in one and forgotten in
# the other classifies as non-standard at review time and its example never gets written.
# These tests pin the halves together.
#
# project-exec-init's earned-topic table is deliberately NOT pinned here: whether a repo
# has earned a topic doc is a judgement, and a row asserting one exists would only restate
# the list. docs/REVIEWING.md names it as the human step.
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

# 1. The standard's topic-set code block lists exactly the same names, in the same order.
SETUP_LIST=$(python3 -c "
import re
s = open('$SETUP_MD', encoding='utf-8').read()
block = re.search(r'## Canonical topic set\s*\n+\`\`\`text\n(.*?)\`\`\`', s, re.S)
print(' '.join(re.findall(r'^\s+(\S+\.md)\s*\$', block.group(1), re.M)) if block else '')
")
assert_eq "topic set: project-setup.md lists the same docs as manifest.py" "$DOCS" "$SETUP_LIST"

# 2. Every canonical doc has a parsed ownership contract and a worked example.
for name in $DOCS; do
  CONTRACT=$(python3 -c "
import importlib.util
spec = importlib.util.spec_from_file_location('m', '$MANIFEST')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
c = m.parse_ownership('$SETUP_MD').get('$name') or {}
missing = [k for k in ('audience', 'inside', 'not_inside') if not c.get(k)]
print(','.join(missing) if missing else 'complete')
")
  assert_eq "contract: docs/$name has Audience, Inside and Not inside" "complete" "$CONTRACT"

  if [[ -f "$EXAMPLES/$name" ]]; then ok "example: examples/docs/$name exists"
  else fail "example: examples/docs/$name is missing — every canonical doc carries a worked example"; fi
done

# 3. Every canonical doc is the target of exactly one review use case. The reviewer spawns
#    one read-review agent per use case, so a doc missing here is audited as a bare file
#    with no idea what work it has to carry.
HISTORY_TARGETS=$(python3 -c "
import importlib.util
spec = importlib.util.spec_from_file_location('h', '$HISTORY')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
print(' '.join(sorted(v.split('/')[-1] for v in h.USE_CASE_DOCS.values())))
")
EXPECTED_TARGETS=$(printf '%s\n' "$DOCS" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')
assert_eq "use cases: history.py covers every canonical doc exactly once" "$EXPECTED_TARGETS" "$HISTORY_TARGETS"

# 4. Every canonical doc has a PURPOSE hint — the execution stage derives its probe task
#    from it, and a doc with no hint is silently dropped from that stage.
PURPOSE_MISSING=$(python3 -c "
import importlib.util
spec = importlib.util.spec_from_file_location('m', '$MANIFEST')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(' '.join(n for n in m.CANONICAL_DOCS if n not in m.PURPOSE))
")
assert_eq "purpose: every canonical doc has a PURPOSE hint" "" "$PURPOSE_MISSING"

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
