#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/project-quality/skills/project-review-docs/scripts/manifest.py"

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
assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then ok "$label"; else
    fail "$label — expected to contain $(printf '%q' "$needle")"; fi
}
assert_exit() {
  local label="$1" expected_code="$2"; shift 2
  local actual_code=0; "$@" >/dev/null 2>&1 || actual_code=$?
  if [[ "$actual_code" -eq "$expected_code" ]]; then ok "$label (exit $expected_code)"; else
    fail "$label — expected exit $expected_code, got $actual_code"; fi
}
json_val() { python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print($2)" <<< "$1"; }

# fixture: a small but complete repo with a routed doc, a dead link, a non-standard doc, a hollow doc.
make_fixture() {
  local dir; dir=$(tmpdir); mkdir -p "$dir/docs"
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  cat > "$dir/AGENTS.md" <<'EOF'
# AGENTS.md — fixture routing

## Repository purpose

A fixture.

## Use-case routing

### Coding

Load [docs/CODING.md](docs/CODING.md) before changes.

### Testing

Load [docs/TESTING.md](docs/TESTING.md) to run tests.
EOF
  printf '# fixture\n\nA product. See [docs/OVERVIEW.md](docs/OVERVIEW.md).\n' > "$dir/README.md"
  printf '# Coding\n\nRun `make build`. See [the missing](docs/GONE.md).\n' > "$dir/docs/CODING.md"
  printf '# Testing\n\n```sh\nmake test\n```\n' > "$dir/docs/TESTING.md"
  printf '# Overview\n\nStructure map.\n' > "$dir/docs/OVERVIEW.md"
  printf '# Some Notes\n\nProject-specific notes not routed anywhere.\n' > "$dir/docs/NOTES.md"
  printf '# Hollow\n' > "$dir/docs/HOLLOW.md"   # heading only → hollow
  echo "$dir"
}

# 1. bad invocation
test_no_args()  { assert_exit "no-args: exit 1" 1 "$SCRIPT"; }
test_bad_dir()  { assert_exit "bad-dir: exit 1" 1 "$SCRIPT" /nonexistent/xyz; }

# 2. valid JSON
test_valid_json() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir")
  if python3 -c "import json,sys; json.loads(sys.stdin.read())" <<< "$out" 2>/dev/null; then
    ok "valid-json: parses"
  else fail "valid-json: not JSON"; fi
  rm -rf "$dir"
}

# 3. metrics present for a canonical file
test_metrics() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir")
  local w; w=$(json_val "$out" "[f['metrics']['words'] for f in d['files'] if f['path']=='docs/CODING.md'][0]")
  # 'Run make build. See the missing docs/GONE.md.' → non-zero word count
  if [[ "$w" -gt 3 ]]; then ok "metrics: CODING word count > 3 (=$w)"; else fail "metrics: bad word count $w"; fi
  local keys; keys=$(json_val "$out" "sorted([f for f in d['files'] if f['path']=='docs/CODING.md'][0]['metrics'].keys())")
  assert_eq "metrics: keys" "['bytes', 'lines', 'non_heading_lines', 'words']" "$keys"
  rm -rf "$dir"
}

# 4. classification
test_classification() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir")
  local readme; readme=$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='README.md'][0]")
  assert_eq "classify: README = canonical-root" "canonical-root" "$readme"
  local coding; coding=$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='docs/CODING.md'][0]")
  assert_eq "classify: docs/CODING.md = canonical" "canonical" "$coding"
  local notes; notes=$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='docs/NOTES.md'][0]")
  assert_eq "classify: docs/NOTES.md = non-standard" "non-standard" "$notes"
  rm -rf "$dir"
}

# 5. docs/ are all optional — absent topic docs are NOT missing; only root files are.
test_missing_canonical() {
  local dir; dir=$(make_fixture)   # has all 3 root files; lacks docs/RELEASING etc.
  local out; out=$("$SCRIPT" "$dir")
  local docs_missing; docs_missing=$(json_val "$out" "[n for n in d['missing_canonical'] if n not in ('README.md','AGENTS.md','CLAUDE.md')]")
  assert_eq "optional docs: no docs/ file reported missing" "[]" "$docs_missing"

  # A missing REQUIRED root file (AGENTS.md) is still flagged.
  local dir2; dir2=$(tmpdir); mkdir -p "$dir2/docs"
  printf '@AGENTS.md\n' > "$dir2/CLAUDE.md"; printf '# r\n' > "$dir2/README.md"   # no AGENTS.md
  local out2; out2=$("$SCRIPT" "$dir2")
  assert_contains "required root: missing AGENTS.md flagged" "AGENTS.md" "$(json_val "$out2" "d['missing_canonical']")"
  rm -rf "$dir" "$dir2"
}

# 6. dead link detected
test_dead_link() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir")
  local n; n=$(json_val "$out" "d['summary']['unresolved_links']")
  if [[ "$n" -ge 1 ]]; then ok "dead-link: GONE.md flagged (unresolved=$n)"; else fail "dead-link: none flagged"; fi
  assert_contains "dead-link: names GONE.md" "GONE.md" "$out"
  rm -rf "$dir"
}

# 7. directory link resolves OK (no false positive)
test_dir_link_ok() {
  local dir; dir=$(tmpdir); mkdir -p "$dir/docs/sub"
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  printf '# A\n\nSee [the subdir](docs/sub/).\n' > "$dir/AGENTS.md"
  printf '# Overview\n' > "$dir/docs/OVERVIEW.md"
  local out; out=$("$SCRIPT" "$dir")
  local n; n=$(json_val "$out" "d['summary']['unresolved_links']")
  assert_eq "dir-link: directory link resolves (0 unresolved)" "0" "$n"
  rm -rf "$dir"
}

# 8. reachability + orphans
test_reachability() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir")
  # CODING is routed from AGENTS → reachable
  local coding; coding=$(json_val "$out" "[f['reachable_from_agents'] for f in d['files'] if f['path']=='docs/CODING.md'][0]")
  assert_eq "reach: CODING reachable" "True" "$coding"
  # NOTES is not linked anywhere → orphan
  assert_contains "reach: NOTES is an orphan" "docs/NOTES.md" "$(json_val "$out" "d['orphans']")"
  # README is a root entry, never an orphan even though AGENTS does not link it
  local orphans; orphans=$(json_val "$out" "d['orphans']")
  if echo "$orphans" | grep -qF "README.md"; then fail "reach: README wrongly an orphan"; else ok "reach: README not an orphan"; fi
  rm -rf "$dir"
}

# 9. ownership contract attached from the real project-setup.md
test_contract() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir")
  local ni; ni=$(json_val "$out" "([f['contract'] for f in d['files'] if f['path']=='README.md'][0] or {}).get('not_inside','')")
  assert_contains "contract: README not_inside mentions dev setup" "dev" "$ni"
  local aud; aud=$(json_val "$out" "([f['contract'] for f in d['files'] if f['path']=='README.md'][0] or {}).get('audience','')")
  assert_contains "contract: README audience mentions users" "user" "$aud"
  # docs/ canonical files head their ownership block as `docs/CODING.md`; the
  # contract must still attach (regression: basename lookup vs path-prefixed heading).
  local ci; ci=$(json_val "$out" "([f['contract'] for f in d['files'] if f['path']=='docs/CODING.md'][0] or {}).get('inside','')")
  assert_contains "contract: docs/CODING.md inside is populated" "build" "$ci"
  rm -rf "$dir"
}

# 10. CLAUDE.md invariant
test_claude_ok() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir")
  assert_eq "claude: canonical when exactly @AGENTS.md" "True" "$(json_val "$out" "d['claude_md']['canonical']")"
  rm -rf "$dir"
}
test_claude_bad() {
  local dir; dir=$(make_fixture)
  printf '@AGENTS.md\n\nextra stuff\n' > "$dir/CLAUDE.md"
  local out; out=$("$SCRIPT" "$dir")
  assert_eq "claude: non-canonical when extra content" "False" "$(json_val "$out" "d['claude_md']['canonical']")"
  rm -rf "$dir"
}

# 11. hollow doc
test_hollow() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir")
  local h; h=$(json_val "$out" "[f['hollow'] for f in d['files'] if f['path']=='docs/HOLLOW.md'][0]")
  assert_eq "hollow: HOLLOW.md flagged" "True" "$h"
  rm -rf "$dir"
}

# 12. AGENTS routes extracted (purpose hint present)
test_routes() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir")
  local n; n=$(json_val "$out" "len([r for r in d['agents_routes'] if r['target'].endswith('.md')])")
  if [[ "$n" -ge 2 ]]; then ok "routes: >=2 md routes (=$n)"; else fail "routes: too few ($n)"; fi
  local purpose; purpose=$(json_val "$out" "[f['purpose'] for f in d['files'] if f['path']=='docs/TESTING.md'][0]")
  assert_eq "routes: TESTING purpose=test" "test" "$purpose"
  rm -rf "$dir"
}

# 13. text format renders
test_text() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir" --format=text)
  assert_contains "text: manifest header" "=== manifest:" "$out"
  assert_contains "text: routes section" "AGENTS.md routes" "$out"
  rm -rf "$dir"
}

test_no_args
test_bad_dir
test_valid_json
test_metrics
test_classification
test_missing_canonical
test_dead_link
test_dir_link_ok
test_reachability
test_contract
test_claude_ok
test_claude_bad
test_hollow
test_routes
test_text

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
