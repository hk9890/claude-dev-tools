#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/plugins/project-quality/skills/project-review-docs/scripts/inventory.py"

PASS=0
FAIL=0

# ── helpers ──────────────────────────────────────────────────────────────────

tmpdir() { mktemp -d; }

ok() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL=$((FAIL + 1))
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    ok "$label"
  else
    fail "$label — expected $(printf '%q' "$expected"), got $(printf '%q' "$actual")"
  fi
}

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    ok "$label"
  else
    fail "$label — expected to contain $(printf '%q' "$needle")"
  fi
}

assert_not_contains() {
  local label="$1" needle="$2" haystack="$3"
  if ! echo "$haystack" | grep -qF "$needle"; then
    ok "$label"
  else
    fail "$label — expected NOT to contain $(printf '%q' "$needle")"
  fi
}

assert_exit() {
  local label="$1" expected_code="$2"
  shift 2
  local actual_code=0
  "$@" >/dev/null 2>&1 || actual_code=$?
  if [[ "$actual_code" -eq "$expected_code" ]]; then
    ok "$label (exit $expected_code)"
  else
    fail "$label — expected exit $expected_code, got $actual_code"
  fi
}

json_val() {
  # Extract a scalar value from JSON using python3 (stdlib only).
  # Usage: json_val <json-string> <python-expression-on-d>
  python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print($2)" <<< "$1"
}

# ── fixture builder ───────────────────────────────────────────────────────────

make_full_fixture() {
  # Creates a fixture repo with:
  #   - all canonical root docs
  #   - all canonical docs/ docs
  #   - one non-canonical docs/ file
  #   - one subdir under docs/
  local dir; dir=$(tmpdir)

  touch "$dir/README.md" "$dir/AGENTS.md"
  printf '# CLAUDE\nSome content here\nMore content\n' > "$dir/CLAUDE.md"

  mkdir -p "$dir/docs"
  for name in OVERVIEW.md CODING.md TESTING.md RELEASING.md MONITORING.md CHANGE-WORKFLOW.md; do
    printf '# %s\nContent line\n' "$name" > "$dir/docs/$name"
  done

  # Non-canonical file in docs/
  printf '# Extra\nLine one\nLine two\n' > "$dir/docs/EXTRA.md"

  # Subdir under docs/
  mkdir -p "$dir/docs/adr"
  touch "$dir/docs/adr/001-decision.md"

  echo "$dir"
}

# ── tests ─────────────────────────────────────────────────────────────────────

# 1. Bad invocation — no args → exit 1
test_no_args() {
  assert_exit "no-args: exit 1" 1 "$SCRIPT"
}

# 2. Non-existent directory → exit 1
test_bad_dir() {
  assert_exit "bad-dir: exit 1" 1 "$SCRIPT" /nonexistent/path/xyz123
}

# 3. Valid JSON output
test_valid_json() {
  local dir; dir=$(tmpdir)
  local out
  out=$("$SCRIPT" "$dir")
  if python3 -c "import json,sys; json.loads(sys.stdin.read())" <<< "$out" 2>/dev/null; then
    ok "valid-json: output parses as JSON"
  else
    fail "valid-json: output is not valid JSON"
  fi
  rm -rf "$dir"
}

# 4. Empty repo — all canonical docs missing
test_all_missing() {
  local dir; dir=$(tmpdir)
  local out
  out=$("$SCRIPT" "$dir")

  local missing
  missing=$(json_val "$out" "d['summary']['canonical_missing']")
  assert_eq "all-missing: canonical_missing=9" "9" "$missing"

  local present
  present=$(json_val "$out" "d['summary']['canonical_present']")
  assert_eq "all-missing: canonical_present=0" "0" "$present"

  rm -rf "$dir"
}

# 5. Full fixture — all canonical docs present
test_all_present() {
  local dir; dir=$(make_full_fixture)
  local out
  out=$("$SCRIPT" "$dir")

  local present
  present=$(json_val "$out" "d['summary']['canonical_present']")
  assert_eq "all-present: canonical_present=9" "9" "$present"

  local missing
  missing=$(json_val "$out" "d['summary']['canonical_missing']")
  assert_eq "all-present: canonical_missing=0" "$missing" "0"

  rm -rf "$dir"
}

# 6. Non-canonical docs/ file detected
test_non_canonical_doc() {
  local dir; dir=$(make_full_fixture)
  local out
  out=$("$SCRIPT" "$dir")

  local count
  count=$(json_val "$out" "d['summary']['non_canonical_count']")
  assert_eq "non-canonical-doc: count=1" "1" "$count"

  assert_contains "non-canonical-doc: EXTRA.md in output" "EXTRA.md" "$out"

  rm -rf "$dir"
}

# 7. Non-canonical subdir detected
test_non_canonical_subdir() {
  local dir; dir=$(make_full_fixture)
  local out
  out=$("$SCRIPT" "$dir")

  local count
  count=$(json_val "$out" "d['summary']['non_canonical_subdir_count']")
  assert_eq "non-canonical-subdir: count=1" "1" "$count"

  assert_contains "non-canonical-subdir: docs/adr/ in output" "docs/adr/" "$out"

  rm -rf "$dir"
}

# 8. Location violation: canonical docs/ file at root
test_location_violation() {
  local dir; dir=$(tmpdir)
  mkdir -p "$dir/docs"
  # Put OVERVIEW.md at the root instead of docs/
  printf '# OVERVIEW\nContent\n' > "$dir/OVERVIEW.md"

  local out
  out=$("$SCRIPT" "$dir")

  local violations
  violations=$(json_val "$out" "d['summary']['violation_count']")
  assert_eq "location-violation: violation_count=1" "1" "$violations"

  assert_contains "location-violation: OVERVIEW.md in violations" "OVERVIEW.md" "$out"

  rm -rf "$dir"
}

# 9. non_heading_lines count is correct
test_non_heading_lines() {
  local dir; dir=$(tmpdir)
  mkdir -p "$dir/docs"
  # 1 heading, 2 content lines, 1 blank line
  printf '# Heading\n\nLine one\nLine two\n' > "$dir/docs/OVERVIEW.md"

  local out
  out=$("$SCRIPT" "$dir")

  local nhl
  nhl=$(json_val "$out" "d['canonical']['OVERVIEW.md']['non_heading_lines']")
  assert_eq "non-heading-lines: count=2" "2" "$nhl"

  local total
  total=$(json_val "$out" "d['canonical']['OVERVIEW.md']['lines']")
  assert_eq "lines: count=4" "4" "$total"

  rm -rf "$dir"
}

# 10. --format=text produces readable output
test_format_text() {
  local dir; dir=$(make_full_fixture)
  local out
  out=$("$SCRIPT" "$dir" --format=text)

  assert_contains "format-text: shows canonical section" "=== Canonical docs ===" "$out"
  assert_contains "format-text: shows summary section" "=== Summary ===" "$out"
  assert_contains "format-text: shows EXTRA.md" "EXTRA.md" "$out"
  assert_contains "format-text: shows docs/adr/" "docs/adr/" "$out"

  rm -rf "$dir"
}

# 11. Docs-only canonical file present→present and missing→missing
test_partial_presence() {
  local dir; dir=$(tmpdir)
  mkdir -p "$dir/docs"
  printf '# README\n' > "$dir/README.md"
  printf '# CODING\nSome content\n' > "$dir/docs/CODING.md"

  local out
  out=$("$SCRIPT" "$dir")

  # README.md present
  local readme_present
  readme_present=$(json_val "$out" "d['canonical']['README.md']['present']")
  assert_eq "partial: README.md present=True" "True" "$readme_present"

  # AGENTS.md missing
  local agents_present
  agents_present=$(json_val "$out" "d['canonical']['AGENTS.md']['present']")
  assert_eq "partial: AGENTS.md present=False" "False" "$agents_present"

  # CODING.md present
  local coding_present
  coding_present=$(json_val "$out" "d['canonical']['CODING.md']['present']")
  assert_eq "partial: CODING.md present=True" "True" "$coding_present"

  # OVERVIEW.md missing (not created)
  local overview_present
  overview_present=$(json_val "$out" "d['canonical']['OVERVIEW.md']['present']")
  assert_eq "partial: OVERVIEW.md present=False" "False" "$overview_present"

  rm -rf "$dir"
}

# 12. No docs/ directory — no crash, empty non_canonical_docs
test_no_docs_dir() {
  local dir; dir=$(tmpdir)
  local out
  out=$("$SCRIPT" "$dir")

  if python3 -c "import json,sys; d=json.loads(sys.stdin.read()); assert d['non_canonical_docs'] == []" <<< "$out" 2>/dev/null; then
    ok "no-docs-dir: non_canonical_docs is empty list"
  else
    fail "no-docs-dir: non_canonical_docs not empty or JSON error"
  fi

  rm -rf "$dir"
}

# 13. .claude.local.md present → personal_local tracked
test_personal_local_present() {
  local dir; dir=$(tmpdir)
  printf '# Local\nSome personal notes.\n' > "$dir/.claude.local.md"
  local out
  out=$("$SCRIPT" "$dir")

  local present
  present=$(json_val "$out" "d['personal_local']['.claude.local.md']['present']")
  assert_eq "personal-local: present=True" "True" "$present"

  local count
  count=$(json_val "$out" "d['summary']['personal_local_present']")
  assert_eq "personal-local: summary count=1" "1" "$count"

  # personal-local files are NOT counted as canonical missing
  local missing
  missing=$(json_val "$out" "d['summary']['canonical_missing']")
  assert_eq "personal-local: not counted as canonical_missing (=9)" "9" "$missing"

  rm -rf "$dir"
}

# 14. .claude.local.md absent → personal_local tracked but absent
test_personal_local_absent() {
  local dir; dir=$(tmpdir)
  local out
  out=$("$SCRIPT" "$dir")

  local present
  present=$(json_val "$out" "d['personal_local']['.claude.local.md']['present']")
  assert_eq "personal-local-absent: present=False" "False" "$present"

  local count
  count=$(json_val "$out" "d['summary']['personal_local_present']")
  assert_eq "personal-local-absent: summary count=0" "0" "$count"

  rm -rf "$dir"
}

# 15. Injected block in AGENTS.md detected
test_injected_block_agents() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  {
    printf '# Agents\n\nNormal routing.\n\n'
    printf '<!-- BEGIN BEADS INTEGRATION v:1 hash:abc -->\n'
    printf '## Beads\nGenerated content here.\nMore lines.\n'
    printf '<!-- END BEADS INTEGRATION -->\n'
  } > "$dir/AGENTS.md"
  local out
  out=$("$SCRIPT" "$dir")

  local count
  count=$(json_val "$out" "d['summary']['injected_block_count']")
  assert_eq "injected-block: count=1" "1" "$count"

  local name
  name=$(json_val "$out" "d['injected_blocks'][0]['name']")
  assert_eq "injected-block: name normalized (metadata stripped)" "BEADS INTEGRATION" "$name"

  local file
  file=$(json_val "$out" "d['injected_blocks'][0]['file']")
  assert_eq "injected-block: file=AGENTS.md" "AGENTS.md" "$file"

  rm -rf "$dir"
}

# 16. Injected block in CLAUDE.md detected
test_injected_block_claude() {
  local dir; dir=$(tmpdir)
  {
    printf '@AGENTS.md\n\n'
    printf '<!-- BEGIN TOOL X -->\n'
    printf 'auto-generated\n'
    printf '<!-- END TOOL X -->\n'
  } > "$dir/CLAUDE.md"
  printf '# Agents\n' > "$dir/AGENTS.md"
  local out
  out=$("$SCRIPT" "$dir")

  local count
  count=$(json_val "$out" "d['summary']['injected_block_count']")
  assert_eq "injected-block-claude: count=1" "1" "$count"

  local file
  file=$(json_val "$out" "d['injected_blocks'][0]['file']")
  assert_eq "injected-block-claude: file=CLAUDE.md" "CLAUDE.md" "$file"

  rm -rf "$dir"
}

# 17. Injected block detection is generic (any name, any metadata)
test_injected_block_generic() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  {
    printf '# Agents\n\n'
    printf '<!-- BEGIN MYTOOL v:2 profile:full hash:xyz -->\n'
    printf 'content\n'
    printf '<!-- END MYTOOL -->\n\n'
    printf '<!-- BEGIN ANOTHER -->\n'
    printf 'more content\n'
    printf '<!-- END ANOTHER -->\n'
  } > "$dir/AGENTS.md"
  local out
  out=$("$SCRIPT" "$dir")

  local count
  count=$(json_val "$out" "d['summary']['injected_block_count']")
  assert_eq "injected-block-generic: count=2" "2" "$count"

  rm -rf "$dir"
}

# 18. Unmatched BEGIN (no END) — not counted
test_injected_block_unmatched() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  {
    printf '# Agents\n\n'
    printf '<!-- BEGIN ORPHAN -->\n'
    printf 'no matching end\n'
  } > "$dir/AGENTS.md"
  local out
  out=$("$SCRIPT" "$dir")

  local count
  count=$(json_val "$out" "d['summary']['injected_block_count']")
  assert_eq "injected-block-unmatched: orphan BEGIN ignored, count=0" "0" "$count"

  rm -rf "$dir"
}

# 19. Injected blocks reported in --format=text output
test_injected_block_text_format() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  {
    printf '# Agents\n\n'
    printf '<!-- BEGIN SOMETHING -->\n'
    printf 'x\n'
    printf '<!-- END SOMETHING -->\n'
  } > "$dir/AGENTS.md"
  local out
  out=$("$SCRIPT" "$dir" --format=text)

  assert_contains "injected-block-text: section header" "=== Injected blocks in steering docs ===" "$out"
  assert_contains "injected-block-text: block name shown" "SOMETHING" "$out"

  rm -rf "$dir"
}

# 20. Injected blocks NOT scanned in regular docs (only CLAUDE.md + AGENTS.md)
test_injected_block_scope() {
  local dir; dir=$(tmpdir)
  printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  printf '# Agents\n' > "$dir/AGENTS.md"
  mkdir -p "$dir/docs"
  {
    printf '# Overview\n\n'
    printf '<!-- BEGIN IGNORED -->\n'
    printf 'this should not be flagged in a non-steering doc\n'
    printf '<!-- END IGNORED -->\n'
  } > "$dir/docs/OVERVIEW.md"
  local out
  out=$("$SCRIPT" "$dir")

  local count
  count=$(json_val "$out" "d['summary']['injected_block_count']")
  assert_eq "injected-block-scope: docs/*.md not scanned, count=0" "0" "$count"

  rm -rf "$dir"
}

# 21. Personal-local file shown in --format=text output
test_personal_local_text_format() {
  local dir; dir=$(tmpdir)
  printf '# Local\nx\n' > "$dir/.claude.local.md"
  local out
  out=$("$SCRIPT" "$dir" --format=text)

  assert_contains "personal-local-text: section header" "=== Personal/local files" "$out"
  assert_contains "personal-local-text: file shown" ".claude.local.md" "$out"

  rm -rf "$dir"
}

# ── run all tests ─────────────────────────────────────────────────────────────

test_no_args
test_bad_dir
test_valid_json
test_all_missing
test_all_present
test_non_canonical_doc
test_non_canonical_subdir
test_location_violation
test_non_heading_lines
test_format_text
test_partial_presence
test_no_docs_dir
test_personal_local_present
test_personal_local_absent
test_injected_block_agents
test_injected_block_claude
test_injected_block_generic
test_injected_block_unmatched
test_injected_block_text_format
test_injected_block_scope
test_personal_local_text_format

echo ""
echo "Results: $PASS passed, $FAIL failed"

[[ "$FAIL" -eq 0 ]] || exit 1
