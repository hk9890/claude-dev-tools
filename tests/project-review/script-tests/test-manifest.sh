#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/plugins/project-review/skills/project-review-docs/scripts/manifest.py"
# The ownership contracts belong to the authoring standard, which lives in another plugin —
# manifest.py is handed the path and never guesses it.
SETUP_MD="$REPO_ROOT/plugins/instruction-writing/skills/writing-project-docs/references/project-setup.md"

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

### Documenting

Load [docs/DOCUMENTING.md](docs/DOCUMENTING.md) before editing a doc.
EOF
  printf '# fixture\n\nA product. See [docs/OVERVIEW.md](docs/OVERVIEW.md).\n' > "$dir/README.md"
  printf '# Coding\n\nRun `make build`. See [the missing](docs/GONE.md).\n' > "$dir/docs/CODING.md"
  printf '# Testing\n\n```sh\nmake test\n```\n' > "$dir/docs/TESTING.md"
  printf '# Overview\n\nStructure map.\n' > "$dir/docs/OVERVIEW.md"
  printf '# Documenting\n\nRun `make docs-lint`. We do not document the hotfix path.\n' > "$dir/docs/DOCUMENTING.md"
  printf '# Some Notes\n\nProject-specific notes not routed anywhere.\n' > "$dir/docs/NOTES.md"
  printf '# Hollow\n' > "$dir/docs/HOLLOW.md"   # heading only → hollow
  echo "$dir"
}

# tmpdir is called as dir=$(tmpdir), so a guard inside it could only exit the
# subshell. Probe once here instead: with no temp dir no fixture materialises,
# and an assertion that greps a fixture's output for an unwanted string would
# pass against the resulting empty output.
probe=$(tmpdir) || { printf 'FAIL: mktemp -d unavailable — fixtures cannot be built\n'; exit 1; }
rmdir "$probe"

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
  printf '# Personal\n\nMy sandbox URL. See [scratch](../scratch.md).\n' > "$dir/CLAUDE.local.md"
  printf '# Personal\n' > "$dir/docs/CLAUDE.local.md"
  local base_dir; base_dir=$(make_fixture)
  local base; base=$("$SCRIPT" "$base_dir"); rm -rf "$base_dir"
  local out; out=$("$SCRIPT" "$dir")
  local readme; readme=$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='README.md'][0]")
  assert_eq "classify: README = canonical-root" "canonical-root" "$readme"
  local coding; coding=$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='docs/CODING.md'][0]")
  assert_eq "classify: docs/CODING.md = canonical" "canonical" "$coding"
  local documenting; documenting=$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='docs/DOCUMENTING.md'][0]")
  assert_eq "classify: docs/DOCUMENTING.md = canonical" "canonical" "$documenting"
  local notes; notes=$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='docs/NOTES.md'][0]")
  assert_eq "classify: docs/NOTES.md = non-standard" "non-standard" "$notes"
  local personal; personal=$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='CLAUDE.local.md'][0]")
  assert_eq "classify: CLAUDE.local.md = personal-local" "personal-local" "$personal"
  local nested; nested=$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='docs/CLAUDE.local.md'][0]")
  assert_eq "classify: docs/CLAUDE.local.md = personal-local" "personal-local" "$nested"
  local orphaned; orphaned=$(json_val "$out" "[p for p in d['orphans'] if p.endswith('CLAUDE.local.md')]")
  assert_eq "orphans: a personal file is never an orphan" "[]" "$orphaned"
  local counts; counts=$(json_val "$out" "(d['summary']['unresolved_links'], d['summary']['hollow'])")
  local base_counts; base_counts=$(json_val "$base" "(d['summary']['unresolved_links'], d['summary']['hollow'])")
  assert_eq "summary: a personal file adds no dead link and no hollow doc" "$base_counts" "$counts"
  rm -rf "$dir"

  # A personal file under the name Claude Code never loads: out of the review, its rename reported.
  dir=$(make_fixture)
  printf '# Personal\n\nMy sandbox URL. See [scratch](../scratch.md).\n' > "$dir/.claude.local.md"
  printf '# Personal\n' > "$dir/docs/.claude.local.md"
  out=$("$SCRIPT" "$dir")
  local legacy; legacy=$(json_val "$out" "sorted(f['classification'] for f in d['files'] if f['path'].endswith('.claude.local.md'))")
  assert_eq "classify: .claude.local.md = personal-legacy" "['personal-legacy', 'personal-legacy']" "$legacy"
  local renames; renames=$(json_val "$out" "sorted((l['path'], l['rename_to'], l['rename_to_exists']) for l in d['legacy_personal'])")
  assert_eq "legacy_personal: each names its rename" "[('.claude.local.md', 'CLAUDE.local.md', False), ('docs/.claude.local.md', 'docs/CLAUDE.local.md', False)]" "$renames"
  orphaned=$(json_val "$out" "[p for p in d['orphans'] if p.endswith('.claude.local.md')]")
  assert_eq "orphans: a legacy personal file is never an orphan" "[]" "$orphaned"
  counts=$(json_val "$out" "(d['summary']['unresolved_links'], d['summary']['hollow'], d['summary']['legacy_personal'])")
  assert_eq "summary: a legacy personal file adds no dead link and no hollow doc, and is counted" "${base_counts%)}, 2)" "$counts"
  local text; text=$("$SCRIPT" "$dir" --format=text)
  assert_contains "text: the legacy personal file and its rename are shown" \
    'LEGACY personal file: .claude.local.md (Claude Code never loads it; rename to CLAUDE.local.md)' "$text"
  local row; row=$(grep -F '  .claude.local.md ' <<< "$text")
  assert_contains "text: the legacy row carries its class" 'personal-legacy' "$row"
  [[ "$row" != *dead-link* ]] && ok "text: a personal row with a dead link carries no dead-link flag" \
    || fail "text: a personal row carries a flag the summary does not count — $row"
  row=$(grep -F '  docs/.claude.local.md ' <<< "$text")  # heading only
  [[ -n "$row" && "$row" != *HOLLOW* ]] && ok "text: a heading-only personal row carries no HOLLOW flag" \
    || fail "text: a heading-only personal row is missing or flagged HOLLOW — $row"

  # The file it moves to exists: the move is a merge, so neither file's notes are lost.
  printf '# Newer\n\nNotes.\n' > "$dir/CLAUDE.local.md"
  out=$("$SCRIPT" "$dir")
  local exists; exists=$(json_val "$out" "[l['rename_to_exists'] for l in d['legacy_personal'] if l['path']=='.claude.local.md'][0]")
  assert_eq "legacy_personal: an existing CLAUDE.local.md is flagged" "True" "$exists"
  text=$("$SCRIPT" "$dir" --format=text)
  assert_contains "text: an existing CLAUDE.local.md turns the rename into a merge" \
    'LEGACY personal file: .claude.local.md (Claude Code never loads it; merge into CLAUDE.local.md, which exists)' "$text"
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
  local out; out=$("$SCRIPT" "$dir" --setup-md="$SETUP_MD")
  local ni; ni=$(json_val "$out" "([f['contract'] for f in d['files'] if f['path']=='README.md'][0] or {}).get('not_inside','')")
  assert_contains "contract: README not_inside mentions dev setup" "dev" "$ni"
  local aud; aud=$(json_val "$out" "([f['contract'] for f in d['files'] if f['path']=='README.md'][0] or {}).get('audience','')")
  assert_contains "contract: README audience mentions users" "user" "$aud"
  # docs/ canonical files head their ownership block as `docs/CODING.md`; the
  # contract must still attach (regression: basename lookup vs path-prefixed heading).
  local ci; ci=$(json_val "$out" "([f['contract'] for f in d['files'] if f['path']=='docs/CODING.md'][0] or {}).get('inside','')")
  assert_contains "contract: docs/CODING.md inside is populated" "build" "$ci"
  local di; di=$(json_val "$out" "([f['contract'] for f in d['files'] if f['path']=='docs/DOCUMENTING.md'][0] or {}).get('inside','')")
  assert_contains "contract: docs/DOCUMENTING.md inside is populated" "delta" "$di"
  # Without the flag the contracts are simply absent — the manifest must still emit its
  # facts rather than fail, since the standard is another plugin's file and may be absent.
  local bare; bare=$("$SCRIPT" "$dir")
  assert_eq "contract: omitted when no --setup-md is given" "None" \
    "$(json_val "$bare" "[f.get('contract') for f in d['files'] if f['path']=='README.md'][0]")"
  assert_eq "contract: the manifest still emits its files without --setup-md" "True" \
    "$(json_val "$bare" "len(d['files']) > 0")"
  rm -rf "$dir"
}

# 9b. a decision record carries the tree's contract; a folder link from AGENTS.md reaches
#     every record, and an unrouted record is an orphan. A file in the tree without the
#     NNNN- prefix is an ordinary non-standard doc.
test_decision_records() {
  local dir; dir=$(make_fixture); mkdir -p "$dir/docs/decisions"
  printf '# 0001: One store\n\nTransactions span rows.\n' > "$dir/docs/decisions/0001-one-store.md"
  printf '# ADR-0002\n\nAnother format.\n' > "$dir/docs/decisions/ADR-0002-other.md"
  local out; out=$("$SCRIPT" "$dir" --setup-md="$SETUP_MD")
  assert_eq "decision: docs/decisions/0001-one-store.md = decision" "decision" \
    "$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='docs/decisions/0001-one-store.md'][0]")"
  assert_contains "decision: the record carries the docs/decisions/ contract" "one file per decision in force" \
    "$(json_val "$out" "([f['contract'] for f in d['files'] if f['path']=='docs/decisions/0001-one-store.md'][0] or {}).get('inside','')")"
  assert_eq "decision: the tree counts once among the present canonical topics" "5" \
    "$(json_val "$out" "d['summary']['optional_canonical_present']")"
  assert_eq "decision: an unnumbered file in the tree = non-standard" "non-standard" \
    "$(json_val "$out" "[f['classification'] for f in d['files'] if f['path']=='docs/decisions/ADR-0002-other.md'][0]")"
  assert_contains "decision: a record with no route to its folder is an orphan" "docs/decisions/0001-one-store.md" \
    "$(json_val "$out" "d['orphans']")"
  printf '\n### Decisions\n\nMUST read [docs/decisions/](docs/decisions/) before a change.\n' >> "$dir/AGENTS.md"
  out=$("$SCRIPT" "$dir")
  assert_eq "decision: a folder link from AGENTS.md reaches every record in it" "[]" \
    "$(json_val "$out" "[p for p in d['orphans'] if p.startswith('docs/decisions/0')]")"
  assert_contains "decision: a folder route keeps its trailing slash" "docs/decisions/" \
    "$(json_val "$out" "[r['target'] for r in d['agents_routes'] if r['target'].startswith('docs/decisions')]")"
  # Only the decisions tree stands for its files: a link to any other folder reaches nothing.
  printf '\nSee [the docs](docs/).\n' >> "$dir/AGENTS.md"
  out=$("$SCRIPT" "$dir")
  assert_contains "decision: a link to another folder leaves its docs orphaned" "docs/NOTES.md" \
    "$(json_val "$out" "d['orphans']")"
  # The tree's route reaches its records only: an index in the tree stays an orphan.
  printf '# Index\n\nA list.\n' > "$dir/docs/decisions/README.md"
  out=$("$SCRIPT" "$dir")
  assert_contains "decision: an index in the tree stays an orphan" "docs/decisions/README.md" \
    "$(json_val "$out" "d['orphans']")"
  # DOCUMENTING.md registers a doc tree by linking its folder: that reaches its docs.
  mkdir -p "$dir/docs/adr"
  printf '# ADR 1\n\nOld format.\n' > "$dir/docs/adr/0001-old.md"
  printf '\nDecision records live in [docs/adr/](adr/).\n' >> "$dir/docs/DOCUMENTING.md"
  out=$("$SCRIPT" "$dir")
  assert_eq "decision: a folder DOCUMENTING.md registers reaches its docs" "[]" \
    "$(json_val "$out" "[p for p in d['orphans'] if p.startswith('docs/adr/')]")"
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
# A CLAUDE.md symlinked to AGENTS.md is present and non-canonical, and the detail says
# why (regression: reported missing, and as "extra content" read through the link).
test_claude_symlink() {
  local dir; dir=$(make_fixture)
  rm "$dir/CLAUDE.md"; ln -s AGENTS.md "$dir/CLAUDE.md"
  printf '<!-- BEGIN tool -->\nx\n<!-- END tool -->\n' >> "$dir/AGENTS.md"
  local out; out=$("$SCRIPT" "$dir")
  assert_eq "claude symlink: AGENTS.md blocks not reported again under CLAUDE.md" "['AGENTS.md']" \
    "$(json_val "$out" "[b['file'] for b in d['injected_blocks']]")"
  assert_eq "claude symlink: present" "True" "$(json_val "$out" "d['claude_md']['present']")"
  assert_eq "claude symlink: not missing" "[]" "$(json_val "$out" "d['missing_canonical']")"
  assert_eq "claude symlink: non-canonical" "False" "$(json_val "$out" "d['claude_md']['canonical']")"
  assert_contains "claude symlink: detail names the link" "symlink to AGENTS.md" "$(json_val "$out" "d['claude_md']['detail']")"
  rm -rf "$dir"
}
# A symlinked AGENTS.md is still scanned for injected blocks (regression: the scan
# skipped every symlink, not only a CLAUDE.md that links to AGENTS.md).
test_agents_symlink_blocks() {
  local dir; dir=$(make_fixture)
  mkdir "$dir/real"; mv "$dir/AGENTS.md" "$dir/real/AGENTS.md"; ln -s real/AGENTS.md "$dir/AGENTS.md"
  printf '<!-- BEGIN tool -->\nx\n<!-- END tool -->\n' >> "$dir/real/AGENTS.md"
  local out; out=$("$SCRIPT" "$dir")
  assert_eq "agents symlink: its blocks are still reported" "['AGENTS.md']" \
    "$(json_val "$out" "[b['file'] for b in d['injected_blocks']]")"
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

# 12. AGENTS routes extracted
test_routes() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir")
  local n; n=$(json_val "$out" "len([r for r in d['agents_routes'] if r['target'].endswith('.md')])")
  if [[ "$n" -ge 2 ]]; then ok "routes: >=2 md routes (=$n)"; else fail "routes: too few ($n)"; fi
  rm -rf "$dir"
}

# 13. --brief keeps what the workflow reads and drops the resolved-link lists, which
# made a 45-doc manifest too large for the agent that relays it to return in full.
test_brief() {
  local dir; dir=$(make_fixture)
  local out; out=$("$SCRIPT" "$dir" --brief)
  assert_eq "brief: one line of JSON" "1" "$(printf '%s\n' "$out" | wc -l | tr -d ' ')"
  assert_eq "brief: no per-file links" "False" "$(json_val "$out" "any('links' in f for f in d['files'])")"
  assert_contains "brief: unresolved links kept" "GONE.md" "$(json_val "$out" "[l for f in d['files'] for l in f['unresolved_links']]")"
  rm -rf "$dir"
}

# 14. text format renders
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
test_decision_records
test_claude_ok
test_claude_bad
test_claude_symlink
test_agents_symlink_blocks
test_hollow
test_routes
test_brief
test_text

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
