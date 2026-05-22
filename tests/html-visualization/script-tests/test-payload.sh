#!/usr/bin/env bash
# test-payload.sh — unit tests for buildFeedbackPayload in the html-ask app.js
#
# Loads the pure function via Node require() (no DOM, no CSRF_TOKEN global)
# and asserts it produces an object matching the html-ask submit-schema.md
# shape for representative widget states.
#
# Part of the html-visualization plugin test harness; auto-discovered by run-all.sh.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_JS="$REPO_ROOT/plugins/html-visualization/assets/ask/app.js"

PASS=0
FAIL=0

ok() {
  printf 'PASS: %s\n' "$1"
  PASS=$((PASS + 1))
}

fail() {
  printf 'FAIL: %s\n' "$1"
  FAIL=$((FAIL + 1))
}

# Run a Node snippet that require()s app.js and exits non-zero on assertion failure.
# Usage: run_node_test <test-name> <node-script>
run_node_test() {
  local name="$1"
  local script="$2"
  local exit_code=0
  node -e "$script" 2>&1 || exit_code=$?
  if [[ "$exit_code" -eq 0 ]]; then
    ok "$name"
  else
    fail "$name"
  fi
}

# ── Verify app.js exists and has no syntax errors ─────────────────────────────

if [[ ! -f "$APP_JS" ]]; then
  printf 'FAIL: app.js not found at %s\n' "$APP_JS"
  exit 1
fi

node --check "$APP_JS" 2>&1
if [[ $? -ne 0 ]]; then
  fail "app.js syntax check"
  exit 1
else
  ok "app.js syntax check (node --check)"
fi

# ── Test 1: payload has exactly the four required keys ────────────────────────

run_node_test "payload has exactly verdict, answers, comments, freeform keys" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'approve',
  answers: {},
  comments: [],
  freeform: ''
});
var keys = Object.keys(payload).sort();
var expected = ['answers', 'comments', 'freeform', 'verdict'];
if (JSON.stringify(keys) !== JSON.stringify(expected)) {
  console.error('Keys mismatch. Got: ' + JSON.stringify(keys));
  process.exit(1);
}
"

# ── Test 2: verdict passes through verbatim ──────────────────────────────────

run_node_test "verdict value passes through verbatim (approve)" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'approve',
  answers: {},
  comments: [],
  freeform: ''
});
if (payload.verdict !== 'approve') {
  console.error('Expected verdict approve, got: ' + payload.verdict);
  process.exit(1);
}
"

run_node_test "verdict value passes through verbatim (approve-with-changes)" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'approve-with-changes',
  answers: { 'q1': 'some text' },
  comments: [],
  freeform: 'please fix the tests'
});
if (payload.verdict !== 'approve-with-changes') {
  console.error('Expected approve-with-changes, got: ' + payload.verdict);
  process.exit(1);
}
"

run_node_test "verdict value passes through verbatim (reject)" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'reject',
  answers: {},
  comments: [],
  freeform: ''
});
if (payload.verdict !== 'reject') {
  console.error('Expected reject, got: ' + payload.verdict);
  process.exit(1);
}
"

# ── Test 3: answers is an object (even when empty) ────────────────────────────

run_node_test "answers is an object when empty" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'approve',
  answers: {},
  comments: [],
  freeform: ''
});
if (typeof payload.answers !== 'object' || Array.isArray(payload.answers)) {
  console.error('Expected answers to be a plain object, got: ' + JSON.stringify(payload.answers));
  process.exit(1);
}
if (Object.keys(payload.answers).length !== 0) {
  console.error('Expected empty answers, got: ' + JSON.stringify(payload.answers));
  process.exit(1);
}
"

run_node_test "answers map carries through with question values" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'approve',
  answers: { 'q1': 'yes', 'q2': ['a', 'b'], 'q-approach-a': 'approve' },
  comments: [],
  freeform: ''
});
if (payload.answers['q1'] !== 'yes') {
  console.error('q1 mismatch'); process.exit(1);
}
if (JSON.stringify(payload.answers['q2']) !== JSON.stringify(['a','b'])) {
  console.error('q2 mismatch'); process.exit(1);
}
if (payload.answers['q-approach-a'] !== 'approve') {
  console.error('q-approach-a mismatch'); process.exit(1);
}
"

# ── Test 4: comments array — non-empty text entries survive ──────────────────

run_node_test "non-empty comments survive in payload" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'approve',
  answers: {},
  comments: [
    { anchor: '#q1', text: 'This needs clarification.' },
    { anchor: '#q2', text: 'Looks fine.' }
  ],
  freeform: ''
});
if (!Array.isArray(payload.comments)) {
  console.error('comments is not an array'); process.exit(1);
}
if (payload.comments.length !== 2) {
  console.error('Expected 2 comments, got: ' + payload.comments.length); process.exit(1);
}
var c = payload.comments[0];
if (c.anchor !== '#q1' || c.text !== 'This needs clarification.') {
  console.error('First comment mismatch: ' + JSON.stringify(c)); process.exit(1);
}
"

# ── Test 5: zero-length comment texts are filtered out ────────────────────────

run_node_test "zero-length comment text is filtered out (schema requirement)" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'approve',
  answers: {},
  comments: [
    { anchor: '#q1', text: '' },
    { anchor: '#q2', text: 'real comment' },
    { anchor: '#q3', text: '   ' }
  ],
  freeform: ''
});
// Only the non-empty text survives; whitespace-only is not trimmed by buildFeedbackPayload
// (trimming is the UI's job), but empty-string IS filtered.
var empties = payload.comments.filter(function(c) { return c.text === ''; });
if (empties.length > 0) {
  console.error('Empty-text comments should be filtered out; got: ' + JSON.stringify(payload.comments));
  process.exit(1);
}
// 'real comment' survives
var real = payload.comments.filter(function(c) { return c.anchor === '#q2'; });
if (real.length !== 1 || real[0].text !== 'real comment') {
  console.error('Non-empty comment not retained: ' + JSON.stringify(payload.comments));
  process.exit(1);
}
"

# ── Test 6: freeform is a string (even when empty) ────────────────────────────

run_node_test "freeform is a string when empty" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'approve',
  answers: {},
  comments: [],
  freeform: ''
});
if (typeof payload.freeform !== 'string') {
  console.error('freeform should be string, got: ' + typeof payload.freeform); process.exit(1);
}
if (payload.freeform !== '') {
  console.error('freeform should be empty string, got: ' + payload.freeform); process.exit(1);
}
"

run_node_test "freeform string passes through verbatim" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'reject',
  answers: {},
  comments: [],
  freeform: 'The timeline is too aggressive and ignores risk.'
});
if (payload.freeform !== 'The timeline is too aggressive and ignores risk.') {
  console.error('freeform mismatch: ' + payload.freeform); process.exit(1);
}
"

# ── Test 7: comment entries have exactly anchor and text fields ───────────────

run_node_test "comment entries have exactly anchor and text fields" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  verdict: 'approve',
  answers: {},
  comments: [{ anchor: '#section-1', text: 'Note here.' }],
  freeform: ''
});
var c = payload.comments[0];
var ckeys = Object.keys(c).sort();
if (JSON.stringify(ckeys) !== JSON.stringify(['anchor','text'])) {
  console.error('Comment keys should be [anchor, text], got: ' + JSON.stringify(ckeys)); process.exit(1);
}
"

# ── Test 8: graceful handling of missing/null state fields ────────────────────

run_node_test "missing state fields produce safe defaults (no throw)" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({});
if (typeof payload.verdict !== 'string') { console.error('verdict not string'); process.exit(1); }
if (typeof payload.answers !== 'object' || Array.isArray(payload.answers)) { console.error('answers not object'); process.exit(1); }
if (!Array.isArray(payload.comments)) { console.error('comments not array'); process.exit(1); }
if (typeof payload.freeform !== 'string') { console.error('freeform not string'); process.exit(1); }
"

# ── Summary ───────────────────────────────────────────────────────────────────

printf '\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
