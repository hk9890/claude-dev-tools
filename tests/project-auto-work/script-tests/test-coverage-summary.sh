#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/project-auto-work/skills/test-tests/scripts/coverage-summary.py"

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

# ---------------------------------------------------------------------------
# LCOV
# ---------------------------------------------------------------------------
DIR=$(tmpdir)
cat > "$DIR/cov.lcov" <<'EOF'
TN:
SF:src/a.py
DA:1,1
DA:2,0
DA:3,4
end_of_record
SF:src/b.py
DA:10,0
DA:11,0
end_of_record
SF:src/a.py
DA:2,7
end_of_record
EOF

OUT=$("$SCRIPT" "$DIR/cov.lcov")
assert_eq "lcov: format"        "lcov" "$(echo "$OUT" | json_val "d['format']")"
assert_eq "lcov: total files"   "2"    "$(echo "$OUT" | json_val "d['totals']['files']")"
# a.py: lines 1,2,3 all covered after merging the second SF record (DA:2,7)
assert_eq "lcov: merged record" "3"    "$(echo "$OUT" | json_val "[f for f in d['files'] if f['path']=='src/a.py'][0]['lines_covered']")"
assert_eq "lcov: uncovered file pct" "0.0" "$(echo "$OUT" | json_val "[f for f in d['files'] if f['path']=='src/b.py'][0]['pct']")"
assert_eq "lcov: overall pct"   "60.0" "$(echo "$OUT" | json_val "d['totals']['pct']")"

OUT=$("$SCRIPT" "$DIR/cov.lcov" --file src/a.py)
assert_eq "lcov --file: covered ranges"   "[[1, 3]]" "$(echo "$OUT" | json_val "d['covered_ranges']")"
assert_eq "lcov --file: uncovered ranges" "[]"       "$(echo "$OUT" | json_val "d['uncovered_ranges']")"

OUT=$("$SCRIPT" "$DIR/cov.lcov" --file a.py)
assert_eq "lcov --file suffix match" "src/a.py" "$(echo "$OUT" | json_val "d['path']")"

# ---------------------------------------------------------------------------
# Cobertura XML
# ---------------------------------------------------------------------------
cat > "$DIR/cov.xml" <<'EOF'
<?xml version="1.0" ?>
<coverage line-rate="0.5">
  <sources><source>.</source></sources>
  <packages>
    <package name="pkg">
      <classes>
        <class filename="pkg/mod.py" name="mod">
          <lines>
            <line number="1" hits="2"/>
            <line number="2" hits="0"/>
            <line number="4" hits="1"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>
EOF

OUT=$("$SCRIPT" "$DIR/cov.xml")
assert_eq "cobertura: format"  "cobertura" "$(echo "$OUT" | json_val "d['format']")"
assert_eq "cobertura: covered" "2"         "$(echo "$OUT" | json_val "d['files'][0]['lines_covered']")"
assert_eq "cobertura: total"   "3"         "$(echo "$OUT" | json_val "d['files'][0]['lines_total']")"

# ---------------------------------------------------------------------------
# coverage.py JSON
# ---------------------------------------------------------------------------
cat > "$DIR/cov.json" <<'EOF'
{"meta": {"version": "7.0"},
 "files": {"src/x.py": {"executed_lines": [1, 2, 5], "missing_lines": [3, 4]}}}
EOF

OUT=$("$SCRIPT" "$DIR/cov.json")
assert_eq "coverage.py: format"  "coverage.py-json" "$(echo "$OUT" | json_val "d['format']")"
assert_eq "coverage.py: pct"     "60.0"             "$(echo "$OUT" | json_val "d['files'][0]['pct']")"

OUT=$("$SCRIPT" "$DIR/cov.json" --file src/x.py)
assert_eq "coverage.py --file: uncovered ranges" "[[3, 4]]" "$(echo "$OUT" | json_val "d['uncovered_ranges']")"

# ---------------------------------------------------------------------------
# Go coverprofile (+ module-path normalization against --repo-root)
# ---------------------------------------------------------------------------
FAKEREPO=$(tmpdir)
mkdir -p "$FAKEREPO/calc"
touch "$FAKEREPO/calc/calc.go"
cat > "$DIR/cov.out" <<'EOF'
mode: set
example.com/mymod/calc/calc.go:3.20,5.2 2 1
example.com/mymod/calc/calc.go:7.20,9.2 1 0
EOF

OUT=$("$SCRIPT" "$DIR/cov.out" --repo-root "$FAKEREPO")
assert_eq "go: format"          "go-coverprofile" "$(echo "$OUT" | json_val "d['format']")"
assert_eq "go: path normalized" "calc/calc.go"    "$(echo "$OUT" | json_val "d['files'][0]['path']")"
# block 3-5 covered (3 lines), block 7-9 uncovered (3 lines)
assert_eq "go: lines covered"   "3"               "$(echo "$OUT" | json_val "d['files'][0]['lines_covered']")"
assert_eq "go: lines total"     "6"               "$(echo "$OUT" | json_val "d['files'][0]['lines_total']")"

OUT=$("$SCRIPT" "$DIR/cov.out" --repo-root "$FAKEREPO" --file calc/calc.go)
assert_eq "go --file: covered ranges" "[[3, 5]]" "$(echo "$OUT" | json_val "d['covered_ranges']")"

# --file also accepts absolute and worktree-prefixed paths (normalized like coverage paths)
OUT=$("$SCRIPT" "$DIR/cov.out" --repo-root "$FAKEREPO" --file "$FAKEREPO/calc/calc.go")
assert_eq "go --file absolute path" "calc/calc.go" "$(echo "$OUT" | json_val "d['path']")"
OUT=$("$SCRIPT" "$DIR/cov.out" --repo-root "$FAKEREPO" --file "/some/worktree/calc/calc.go")
assert_eq "go --file worktree-prefixed path" "calc/calc.go" "$(echo "$OUT" | json_val "d['path']")"

# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------
echo "not a coverage file at all" > "$DIR/garbage.txt"
assert_exit "garbage input rejected"    3 "$SCRIPT" "$DIR/garbage.txt"
assert_exit "missing file rejected"     3 "$SCRIPT" "$DIR/does-not-exist"
assert_exit "no args is a usage error"  2 "$SCRIPT"
assert_exit "--file with no data"       3 "$SCRIPT" "$DIR/cov.lcov" --file nope.py

# ---------------------------------------------------------------------------
echo
echo "$PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
