#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/project-auto-work/skills/test-tests/scripts/validate-coverage-summary.py"

PASS=0
FAIL=0

tmpdir() { mktemp -d; }
ok()   { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then ok "$label"; else
    fail "$label — expected $(printf '%q' "$expected"), got $(printf '%q' "$actual")"; fi
}
assert_exit() {
  local label="$1" expected_code="$2"; shift 2
  local actual_code=0; "$@" >/dev/null 2>&1 || actual_code=$?
  if [[ "$actual_code" -eq "$expected_code" ]]; then ok "$label (exit $expected_code)"; else
    fail "$label — expected exit $expected_code, got $actual_code"; fi
}
json_val() { python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print($1)"; }

DIR=$(tmpdir)

# ---------------------------------------------------------------------------
# Valid document → normalized summary
# ---------------------------------------------------------------------------
cat > "$DIR/ok.json" <<'EOF'
{"files": [
  {"path": "src/a.py", "covered_ranges": [[1, 3], [5, 5]], "uncovered_ranges": [[4, 4], [6, 7]]},
  {"path": "src/b.py", "covered_ranges": [],               "uncovered_ranges": [[10, 12]]}
]}
EOF

OUT=$("$SCRIPT" "$DIR/ok.json")
assert_eq "valid: total files"         "2"    "$(echo "$OUT" | json_val "d['totals']['files']")"
assert_eq "valid: total lines_covered" "4"    "$(echo "$OUT" | json_val "d['totals']['lines_covered']")"
assert_eq "valid: total lines_total"   "10"   "$(echo "$OUT" | json_val "d['totals']['lines_total']")"
assert_eq "valid: total pct"           "40.0" "$(echo "$OUT" | json_val "d['totals']['pct']")"
# a.py: covered {1,2,3,5}=4, uncovered {4,6,7}=3 → 4/7 = 57.1%
assert_eq "valid: a.py covered"        "4"          "$(echo "$OUT" | json_val "[f for f in d['files'] if f['path']=='src/a.py'][0]['lines_covered']")"
assert_eq "valid: a.py pct"            "57.1"       "$(echo "$OUT" | json_val "[f for f in d['files'] if f['path']=='src/a.py'][0]['pct']")"
assert_eq "valid: a.py covered_ranges" "[[1, 3], [5, 5]]" "$(echo "$OUT" | json_val "[f for f in d['files'] if f['path']=='src/a.py'][0]['covered_ranges']")"
assert_eq "valid: b.py pct"            "0.0"        "$(echo "$OUT" | json_val "[f for f in d['files'] if f['path']=='src/b.py'][0]['pct']")"

# stdin is equivalent to a file argument
OUT=$("$SCRIPT" < "$DIR/ok.json")
assert_eq "valid via stdin: total files" "2" "$(echo "$OUT" | json_val "d['totals']['files']")"

# ---------------------------------------------------------------------------
# Overlap: covered wins, uncovered excludes covered lines
# ---------------------------------------------------------------------------
cat > "$DIR/overlap.json" <<'EOF'
{"files": [{"path": "x", "covered_ranges": [[1, 5]], "uncovered_ranges": [[3, 8]]}]}
EOF
OUT=$("$SCRIPT" "$DIR/overlap.json")
assert_eq "overlap: lines_total"       "8"        "$(echo "$OUT" | json_val "d['files'][0]['lines_total']")"
assert_eq "overlap: lines_covered"     "5"        "$(echo "$OUT" | json_val "d['files'][0]['lines_covered']")"
assert_eq "overlap: uncovered_ranges"  "[[6, 8]]" "$(echo "$OUT" | json_val "d['files'][0]['uncovered_ranges']")"

# ---------------------------------------------------------------------------
# Ranges are merged and sorted
# ---------------------------------------------------------------------------
cat > "$DIR/merge.json" <<'EOF'
{"files": [{"path": "m", "covered_ranges": [[3, 4], [1, 2]], "uncovered_ranges": []}]}
EOF
OUT=$("$SCRIPT" "$DIR/merge.json")
assert_eq "merge: covered_ranges" "[[1, 4]]" "$(echo "$OUT" | json_val "d['files'][0]['covered_ranges']")"

# ---------------------------------------------------------------------------
# Path normalization: ./ prefix stripped, backslashes folded
# ---------------------------------------------------------------------------
cat > "$DIR/paths.json" <<'EOF'
{"files": [{"path": "./pkg\\mod.py", "covered_ranges": [[1, 1]], "uncovered_ranges": []}]}
EOF
OUT=$("$SCRIPT" "$DIR/paths.json")
assert_eq "path: normalized" "pkg/mod.py" "$(echo "$OUT" | json_val "d['files'][0]['path']")"

# ---------------------------------------------------------------------------
# Non-conforming inputs → exit 3
# ---------------------------------------------------------------------------
abs='{"files": [{"path": "/abs/x", "covered_ranges": [[1, 1]], "uncovered_ranges": []}]}'
dotdot='{"files": [{"path": "../x", "covered_ranges": [[1, 1]], "uncovered_ranges": []}]}'
badrange='{"files": [{"path": "x", "covered_ranges": [[5, 1]], "uncovered_ranges": []}]}'
nonint='{"files": [{"path": "x", "covered_ranges": [["a", "b"]], "uncovered_ranges": []}]}'
zerostart='{"files": [{"path": "x", "covered_ranges": [[0, 3]], "uncovered_ranges": []}]}'
nolines='{"files": [{"path": "x", "covered_ranges": [], "uncovered_ranges": []}]}'
dup='{"files": [{"path": "x", "covered_ranges": [[1, 1]], "uncovered_ranges": []}, {"path": "./x", "covered_ranges": [[2, 2]], "uncovered_ranges": []}]}'
nofiles='{"coverage": 1}'
emptyfiles='{"files": []}'

for pair in "abs:$abs" "dotdot:$dotdot" "badrange:$badrange" "nonint:$nonint" \
            "zerostart:$zerostart" "nolines:$nolines" "dup:$dup" \
            "nofiles:$nofiles" "emptyfiles:$emptyfiles"; do
  name="${pair%%:*}"; body="${pair#*:}"
  printf '%s' "$body" > "$DIR/$name.json"
  assert_exit "reject: $name" 3 "$SCRIPT" "$DIR/$name.json"
done

echo "not json at all" > "$DIR/garbage.txt"
assert_exit "reject: non-JSON"      3 "$SCRIPT" "$DIR/garbage.txt"
assert_exit "reject: missing file"  3 "$SCRIPT" "$DIR/does-not-exist.json"
assert_exit "usage: too many args"  2 "$SCRIPT" a b

# ---------------------------------------------------------------------------
echo
echo "$PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
