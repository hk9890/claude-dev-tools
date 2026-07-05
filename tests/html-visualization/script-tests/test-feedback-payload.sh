#!/usr/bin/env bash
# test-feedback-payload.sh — unit tests for buildFeedbackPayload in the
# feedback-mode app.js (assets/feedback/app.js).
#
# Loads the pure function via Node require() (no DOM, no CSRF_TOKEN global)
# and asserts it produces an object matching the feedback-submit-schema.md
# shape for representative comment states.
#
# Part of the html-visualization plugin test harness; auto-discovered by run-all.sh.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_JS="$REPO_ROOT/plugins/html-visualization/assets/feedback/app.js"

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
  printf 'FAIL: feedback app.js not found at %s\n' "$APP_JS"
  exit 1
fi

if node --check "$APP_JS" 2>&1; then
  ok "app.js syntax check (node --check)"
else
  fail "app.js syntax check"
  exit 1
fi

# ── Test 1: payload has exactly the two required keys ─────────────────────────

run_node_test "payload has exactly action, comments, freeform keys" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({ comments: [], freeform: '' });
var keys = Object.keys(payload).sort();
if (JSON.stringify(keys) !== JSON.stringify(['action','comments','freeform'])) {
  console.error('Keys mismatch. Got: ' + JSON.stringify(keys));
  process.exit(1);
}
"

# ── action field — apply / submit / default ──────────────────────────────────

run_node_test "action 'apply' passes through" "
var app = require('$APP_JS');
if (app.buildFeedbackPayload({ action: 'apply', comments: [], freeform: '' }).action !== 'apply') {
  console.error('apply not preserved'); process.exit(1);
}
"

run_node_test "action 'submit' passes through" "
var app = require('$APP_JS');
if (app.buildFeedbackPayload({ action: 'submit', comments: [], freeform: '' }).action !== 'submit') {
  console.error('submit not preserved'); process.exit(1);
}
"

run_node_test "action defaults to 'submit' when absent or unrecognised" "
var app = require('$APP_JS');
if (app.buildFeedbackPayload({ comments: [], freeform: '' }).action !== 'submit') {
  console.error('missing action should default to submit'); process.exit(1);
}
if (app.buildFeedbackPayload({ action: 'bogus', comments: [], freeform: '' }).action !== 'submit') {
  console.error('unrecognised action should default to submit'); process.exit(1);
}
"

# ── Test 2: freeform passes through / defaults to '' ──────────────────────────

run_node_test "freeform passes through verbatim" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({ comments: [], freeform: 'tighten the intro' });
if (payload.freeform !== 'tighten the intro') {
  console.error('freeform mismatch: ' + payload.freeform); process.exit(1);
}
"

run_node_test "missing state fields produce safe defaults (no throw)" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({});
if (typeof payload.freeform !== 'string') { console.error('freeform not string'); process.exit(1); }
if (!Array.isArray(payload.comments)) { console.error('comments not array'); process.exit(1); }
"

# ── Test 3: non-empty comments survive ────────────────────────────────────────

run_node_test "non-empty comments survive with all five fields" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  comments: [
    { blockId: 'b-intro', blockText: 'The intro paragraph.', quote: 'intro', text: 'remove this' }
  ],
  freeform: ''
});
if (payload.comments.length !== 1) {
  console.error('Expected 1 comment, got ' + payload.comments.length); process.exit(1);
}
var c = payload.comments[0];
var keys = Object.keys(c).sort();
if (JSON.stringify(keys) !== JSON.stringify(['blockId','blockText','quote','quoteStart','text'])) {
  console.error('Comment keys mismatch: ' + JSON.stringify(keys)); process.exit(1);
}
if (c.blockId !== 'b-intro' || c.quote !== 'intro' || c.text !== 'remove this') {
  console.error('Comment values mismatch: ' + JSON.stringify(c)); process.exit(1);
}
if (c.quoteStart !== -1) {
  console.error('quoteStart default wrong: ' + c.quoteStart); process.exit(1);
}
"

# ── Test 4: empty-text comments are filtered out ──────────────────────────────

run_node_test "comments with empty text are filtered out" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  comments: [
    { blockId: 'b1', blockText: 't', quote: '', text: '' },
    { blockId: 'b2', blockText: 't', quote: '', text: 'real comment' }
  ],
  freeform: ''
});
if (payload.comments.length !== 1 || payload.comments[0].blockId !== 'b2') {
  console.error('Empty-text comment not filtered: ' + JSON.stringify(payload.comments));
  process.exit(1);
}
"

# ── Test 5: comments without a blockId are filtered out ───────────────────────

run_node_test "comments without a blockId are filtered out" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  comments: [
    { blockText: 't', quote: '', text: 'orphan comment' },
    { blockId: '', blockText: 't', quote: '', text: 'empty id' },
    { blockId: 'b3', blockText: 't', quote: '', text: 'anchored' }
  ],
  freeform: ''
});
if (payload.comments.length !== 1 || payload.comments[0].blockId !== 'b3') {
  console.error('Un-anchored comment not filtered: ' + JSON.stringify(payload.comments));
  process.exit(1);
}
"

# ── Test 6: blockText and quote default to '' when absent ─────────────────────

run_node_test "blockText and quote default to empty string" "
var app = require('$APP_JS');
var payload = app.buildFeedbackPayload({
  comments: [ { blockId: 'b4', text: 'note' } ],
  freeform: ''
});
var c = payload.comments[0];
if (c.blockText !== '' || c.quote !== '') {
  console.error('Defaults wrong: ' + JSON.stringify(c)); process.exit(1);
}
"

# ── Summary ───────────────────────────────────────────────────────────────────

printf '\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"

[[ "$FAIL" -eq 0 ]] || exit 1
