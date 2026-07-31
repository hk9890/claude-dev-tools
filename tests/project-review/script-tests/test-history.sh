#!/usr/bin/env bash
# test-history.sh — the docs review's history stage, deterministic layer.
#
# history.py answers "did past sessions open the doc their route points at" from real
# transcripts. Everything it does is mechanical; the one thing it must never do is decide
# what a session was *about*, because a grep that guesses intent would quietly decide the
# stage's findings too. These tests pin both halves: the extraction is faithful, and no
# subcommand infers a use case without labels handed to it.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/plugins/project-review/skills/project-review-docs/scripts/history.py"
WORKFLOW="$REPO_ROOT/plugins/project-review/skills/project-review-docs/workflows/review-docs.js"

PASS=0
FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then ok "$label"; else
    fail "$label — expected $(printf '%q' "$expected"), got $(printf '%q' "$actual")"; fi
}
assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then ok "$label"; else
    fail "$label — expected to contain $(printf '%q' "$needle")"; fi
}
assert_missing() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    fail "$label — did not expect $(printf '%q' "$needle")"; else ok "$label"; fi
}
json_val() { python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print($1)"; }

# ---------------------------------------------------------------------------
# Fixture: a git repo with a doc, plus a fake ~/.claude/projects transcript for it.
# ---------------------------------------------------------------------------

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT
REPO="$FIX/repo"
PROJECTS="$FIX/projects"
mkdir -p "$REPO/docs" "$PROJECTS"

git -C "$REPO" init -q 2>/dev/null
git -C "$REPO" config user.email t@t.t
git -C "$REPO" config user.name t
printf '# Coding\n\nRules go here.\nMore rules.\n' > "$REPO/docs/CODING.md"
printf '# Testing\n\nRun the suite.\n' > "$REPO/docs/TESTING.md"
git -C "$REPO" add -A >/dev/null 2>&1
# Date the first commit BEFORE the fixture session below. A doc created after a session
# ran cannot be evidence about that session, and the churn filter correctly excludes it —
# so a fixture whose repo postdates its own transcript would test nothing but the filter.
GIT_AUTHOR_DATE="2019-01-01T00:00:00Z" GIT_COMMITTER_DATE="2019-01-01T00:00:00Z" \
  git -C "$REPO" commit -qm init >/dev/null 2>&1

SLUG=$(python3 -c "import re,sys; print(re.sub(r'[^a-zA-Z0-9]','-',sys.argv[1]))" "$REPO")
mkdir -p "$PROJECTS/$SLUG"

# One session: a real prompt, a harness-only turn, a subagent turn, and tool calls that
# read the doc AFTER the first write — the "late" signal the judge has to be able to see.
cat > "$PROJECTS/$SLUG/sess-1.jsonl" <<EOF
{"type":"user","sessionId":"sess-1","timestamp":"2020-01-01T00:00:00Z","message":{"content":"add a new module under src"}}
{"type":"user","sessionId":"sess-1","timestamp":"2020-01-01T00:00:01Z","message":{"content":"<system-reminder>ignore me</system-reminder>"}}
{"type":"user","sessionId":"sess-1","timestamp":"2020-01-01T00:00:02Z","isSidechain":true,"message":{"content":"subagent prompt, not the human"}}
{"type":"user","sessionId":"sess-1","timestamp":"2020-01-01T00:00:03Z","message":{"content":[{"type":"tool_result","content":"tool output, not the human"}]}}
{"type":"assistant","sessionId":"sess-1","timestamp":"2020-01-01T00:00:04Z","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"$REPO/src/a.py"}}]}}
{"type":"assistant","sessionId":"sess-1","timestamp":"2020-01-01T00:00:05Z","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"$REPO/docs/CODING.md"}}]}}
{"type":"assistant","sessionId":"sess-1","timestamp":"2020-01-01T00:00:06Z","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"pytest -q"}}]}}
EOF

OUT="$FIX/out"

# ---------------------------------------------------------------------------
# prompts
# ---------------------------------------------------------------------------

P=$(python3 "$SCRIPT" prompts "$REPO" --out "$OUT" --projects-dir "$PROJECTS" 2>&1)
assert_eq "prompts: finds the repo's transcript" "1" "$(json_val "d['transcripts_found']" <<< "$P")"
assert_eq "prompts: writes one batch" "1" "$(json_val "len(d['batches'])" <<< "$P")"
assert_eq "prompts: only the human turn is extracted" "1" "$(json_val "d['batches'][0]['messages']" <<< "$P")"

BATCH=$(cat "$OUT/prompts-01.json")
assert_contains "prompts: the user's own text survives" "add a new module under src" "$BATCH"
assert_missing  "prompts: harness scaffolding is stripped" "ignore me" "$BATCH"
assert_missing  "prompts: subagent prompts are not human turns" "not the human" "$BATCH"
assert_contains "prompts: the label vocabulary travels with the batch" '"coding"' "$BATCH"
# Intent is judgment. If any use case ever appears in the extractor's output for a session,
# the script has started guessing and the classifier is no longer the only labeller.
assert_missing  "prompts: the extractor assigns no use case of its own" '"use_case"' "$BATCH"

# ---------------------------------------------------------------------------
# evidence
# ---------------------------------------------------------------------------

# With no labels there is nothing to judge — the stage must stay empty, not fall back.
E0=$(python3 "$SCRIPT" evidence "$REPO" --scratch "$OUT" --projects-dir "$PROJECTS" 2>&1)
assert_eq "evidence: no labels means no segments" "0" "$(json_val "d['coverage']['coding']['labelled']" <<< "$E0")"

TURN=$(python3 -c "import json;print(json.load(open('$OUT/prompts-01.json'))['sessions'][0]['messages'][0]['turn'])")
cat > "$OUT/labels-01.json" <<EOF
{"sessions":[{"session_id":"sess-1","labels":[{"turn":$TURN,"use_case":"coding"}]}]}
EOF

E=$(python3 "$SCRIPT" evidence "$REPO" --scratch "$OUT" --projects-dir "$PROJECTS" --per-use-case 3 2>&1)
assert_eq "evidence: the labelled segment is picked up" "1" "$(json_val "d['coverage']['coding']['labelled']" <<< "$E")"
assert_eq "evidence: an unchanged doc keeps its segment valid" "1" "$(json_val "d['coverage']['coding']['valid']" <<< "$E")"
assert_eq "evidence: an unlabelled use case stays empty" "0" "$(json_val "d['coverage']['testing']['labelled']" <<< "$E")"

EV="$OUT/evidence.json"
seg() { json_val "d['use_cases'][[u['use_case'] for u in d['use_cases']].index('coding')]['segments'][0]$1" < "$EV"; }
assert_eq "evidence: the doc read is located" "5" "$(seg "['activity']['first_doc_read_turn']")"
assert_eq "evidence: the first action of that kind is located" "4" "$(seg "['activity']['first_work_turn']")"
assert_eq "evidence: writes are counted" "1" "$(seg "['activity']['counts']['writes']")"
assert_eq "evidence: commands are counted" "1" "$(seg "['activity']['counts']['commands']")"
assert_eq "evidence: an untouched doc is not partial evidence" "False" "$(seg "['partial_evidence']")"

# Churn filter: rewrite the doc now, and the old segment stops being evidence about the
# text that exists today. This is the lagging-indicator guard.
printf '# Coding\n\nCompletely rewritten.\nAnd again.\nAnd more.\n' > "$REPO/docs/CODING.md"
git -C "$REPO" commit -qam rewrite >/dev/null 2>&1
E2=$(python3 "$SCRIPT" evidence "$REPO" --scratch "$OUT" --projects-dir "$PROJECTS" --churn-max 0.25 2>&1)
assert_eq "evidence: a rewritten doc excludes its stale segments" "1" \
  "$(json_val "d['coverage']['coding']['excluded_churn']" <<< "$E2")"
assert_eq "evidence: and leaves none standing" "0" "$(json_val "d['coverage']['coding']['valid']" <<< "$E2")"
# A generous threshold keeps the segment, flagged rather than silently trusted.
E3=$(python3 "$SCRIPT" evidence "$REPO" --scratch "$OUT" --projects-dir "$PROJECTS" --churn-max 9 2>&1)
assert_eq "evidence: a tolerated change keeps the segment" "1" "$(json_val "d['coverage']['coding']['valid']" <<< "$E3")"
assert_eq "evidence: but marks it partial rather than clean" "1" "$(json_val "d['coverage']['coding']['partial']" <<< "$E3")"

# A use case whose doc does not exist is never reviewed and never reported missing.
rm "$REPO/docs/TESTING.md"
E4=$(python3 "$SCRIPT" evidence "$REPO" --scratch "$OUT" --projects-dir "$PROJECTS" 2>&1)
assert_eq "evidence: an absent doc is skipped, not reported as a gap" "True" \
  "$(json_val "d['coverage']['testing'].get('doc_missing', False)" <<< "$E4")"

# A repo nobody has opened in Claude Code: an empty answer, exit 0, no crash.
EMPTY=$(mktemp -d)
P2=$(python3 "$SCRIPT" prompts "$REPO" --out "$EMPTY/out" --projects-dir "$EMPTY/none" 2>&1)
rc=$?
assert_eq "empty: a repo with no transcripts still exits 0" "0" "$rc"
assert_eq "empty: and reports no batches" "0" "$(json_val "len(d['batches'])" <<< "$P2")"
rm -rf "$EMPTY"

# ---------------------------------------------------------------------------
# Drift: the use-case table exists twice — Python owns the classifier's vocabulary,
# JS owns the review prompts. Workflow scripts cannot import, so pin them here.
# ---------------------------------------------------------------------------

PY_MAP=$(python3 -c "
import importlib.util, json
spec = importlib.util.spec_from_file_location('h', '$SCRIPT')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(json.dumps(m.USE_CASE_DOCS, sort_keys=True, separators=(',', ':')))
")
JS_MAP=$(node -e "
const src = require('fs').readFileSync('$WORKFLOW','utf8');
const body = src.slice(src.indexOf('const USE_CASES ='));
const obj = eval('(' + body.slice(body.indexOf('{'), body.indexOf('\n}') + 2) + ')');
const out = {}; for (const k of Object.keys(obj)) out[k] = obj[k].doc;
console.log(JSON.stringify(out, Object.keys(out).sort()));
")
assert_eq "drift: history.py and review-docs.js agree on every use case and its doc" "$PY_MAP" "$JS_MAP"

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
