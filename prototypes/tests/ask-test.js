#!/usr/bin/env node
/* ask-test.js — interaction tests for prototypes/ask.html on 127.0.0.1:8917. */
'use strict';
//
// Usage: serve the prototypes first, then run with node:
//   python3 -m http.server 8917 --bind 0.0.0.0 --directory prototypes &
//   node prototypes/tests/<this-file>
// Override the base URL with PROTO_BASE if using another port.

const BASE = process.env.PROTO_BASE || 'http://127.0.0.1:8917';
const path = require('path');
const fs = require('fs');
const os = require('os');

// Resolve playwright from the npm _npx cache, as tests/html-visualization/
// script-tests/test-browser.js does. Exit 77 (skip convention) when absent.
function findPlaywright() {
  const dir = path.join(os.homedir(), '.npm', '_npx');
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry, 'node_modules', 'playwright');
    if (fs.existsSync(path.join(p, 'package.json'))) return p;
  }
  return null;
}
const playwrightDir = findPlaywright();
if (!playwrightDir) {
  console.log('SKIP: playwright not found in npm _npx cache. Run: npx playwright install chromium');
  process.exit(77);
}
const { chromium } = require(playwrightDir);

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => { failed++; console.log('  FAIL pageerror: ' + e.message); });

  console.log('ask.html');
  await page.goto(BASE + '/ask.html', { waitUntil: 'load' });

  ok((await page.textContent('#progress-count')).trim() === '0/8 answered', 'progress starts 0/8');
  ok((await page.locator('#qindex a').count()) === 8, 'question index lists 8 entries');
  ok((await page.locator('.widget.answered').count()) === 0, 'no widget marked answered initially');

  // explain dialog
  ok((await page.locator('.q-explain-btn').count()) === 8, 'every question has an Explain button');
  ok((await page.locator('dialog.explain-dialog[open]').count()) === 0, 'explain dialog starts closed');
  await page.click('#q-legacy .q-explain-btn');
  ok(await page.locator('dialog.explain-dialog[open]').isVisible(), 'Explain button opens the dialog');
  ok((await page.textContent('#explain-title')).trim() === 'Feedback schema migration',
     'dialog titled with the question');
  ok((await page.textContent('#explain-body')).includes('exactly one reader'),
     'dialog body is plain-English prose');
  await page.keyboard.press('Escape');
  ok((await page.locator('dialog.explain-dialog[open]').count()) === 0, 'Esc closes the explain dialog');
  await page.click('#q-verdict .q-explain-btn');
  ok((await page.textContent('#explain-title')).trim() === 'Overall verdict', 'verdict explainer works too');
  await page.click('#explain-ok');
  ok((await page.locator('dialog.explain-dialog[open]').count()) === 0, 'Got it closes the dialog');

  // radio
  await page.click('input[name="q-legacy"][value="in-place"]');
  ok((await page.textContent('#progress-count')).trim() === '1/8 answered', 'radio answer → 1/8');
  ok(await page.locator('#q-legacy').evaluate(el => el.classList.contains('answered')), 'radio widget gets answered edge');
  ok(await page.locator('#qindex a[data-q="q-legacy"]').evaluate(el => el.classList.contains('done')),
     'question index marks it done');

  // cards, scale, checkbox
  await page.click('input[name="q-rail"][value="margin"]');
  ok((await page.textContent('#progress-count')).trim() === '2/8 answered', 'card choice → 2/8');
  await page.click('#scale-q-theme .scale-opt:nth-child(4)');
  ok((await page.textContent('#progress-count')).trim() === '3/8 answered', 'scale pick → 3/8');
  await page.click('input[name="q-render"][value="code-highlight"]');
  await page.click('input[name="q-render"][value="toc"]');
  ok((await page.textContent('#progress-count')).trim() === '4/8 answered', 'checkboxes → 4/8');

  // submit with 4 unanswered → panel, not drawer
  await page.click('#submit-btn');
  ok(await page.locator('#unanswered-panel.show').isVisible(), 'unanswered panel appears');
  ok((await page.locator('#unanswered-list li').count()) === 4, 'panel lists the 4 open questions');
  ok((await page.locator('.drawer.open').count()) === 0, 'no drawer while panel is up');
  await page.click('#keep-answering');
  ok((await page.locator('#unanswered-panel.show').count()) === 0, 'keep answering hides the panel');

  // architecture widget: diagrams render, agree counts, node comments work
  await page.waitForSelector('#q-arch .mermaid-block[data-diagram="after"] svg g.node', { timeout: 30000 });
  ok((await page.locator('#q-arch svg').count()) === 2, 'before/after diagrams both render');
  await page.click('input[name="q-arch"][value="agree"]');
  ok((await page.textContent('#progress-count')).trim() === '5/8 answered', 'architecture agree → 5/8');

  const selNode = page.locator('#q-arch .mermaid-block[data-diagram="after"] g.node', { hasText: 'shared/selection.js' }).first();
  await selNode.click();
  await page.waitForSelector('.pv-editor');
  ok((await page.textContent('.pv-editor .pv-kind')) === 'diagram node', 'node click opens editor kind=diagram node');
  await page.fill('.pv-ta', 'Name it selection.js only if ask mode really loads it.');
  await page.click('.pv-btn-primary');
  ok((await page.locator('#q-arch .q-comment').count()) === 1, 'node comment card lands under the question');
  ok(await selNode.evaluate(el => el.classList.contains('pv-noded')), 'commented node keeps a ring');
  ok(await page.isVisible('#q-arch .pv-node-pin'), 'overlay pin on the diagram node');

  // rank, text, note, verdict
  await page.locator('#rank-q-priority .rank-item').first().locator('.rank-down').click();
  ok((await page.locator('#rank-q-priority .rank-item').first().getAttribute('data-opt')) === 'theme',
     'rank-down swaps the first two items');
  ok((await page.textContent('#progress-count')).trim() === '6/8 answered', 'rank touch → 6/8');
  await page.fill('[data-text-for="q-misc"]', 'Node pins could be larger.');
  ok((await page.textContent('#progress-count')).trim() === '7/8 answered', 'free text → 7/8');
  await page.fill('[data-note-for="q-legacy"]', 'Document the break in the schema doc changelog.');
  await page.click('input[name="verdict"][value="approve-with-changes"]');
  ok((await page.textContent('#progress-count')).trim() === '8/8 answered', 'verdict → 8/8');

  // anchored option comment via the 💬 affordance
  const collapsibleRow = page.locator('#q-render .opt-row', { hasText: 'Collapsible sections' });
  await collapsibleRow.hover();
  await collapsibleRow.locator('.opt-comment-btn').click();
  await page.waitForSelector('.pv-editor');
  ok((await page.textContent('.pv-editor .pv-kind')) === 'option', 'option 💬 opens editor kind=option');
  await page.fill('.pv-ta', 'Ship it, but do not implement the tests for it yet.');
  await page.click('.pv-btn-primary');
  ok((await page.locator('#q-render .q-comment').count()) === 1, 'option comment card under its question');
  ok((await page.locator('input[name="q-render"]:checked').count()) === 2,
     'commenting an option does not toggle its checkbox');

  // anchored quote via text selection
  await page.evaluate(() => {
    const hint = document.querySelector('#q-priority .q-hint');
    const walker = document.createTreeWalker(hint, NodeFilter.SHOW_TEXT);
    let node, idx = -1;
    while ((node = walker.nextNode())) {
      idx = node.textContent.indexOf('orders the commits');
      if (idx !== -1) break;
    }
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + 'orders the commits'.length);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.waitForTimeout(60);
  ok(await page.isVisible('.pv-pill'), 'selection pill appears in ask mode');
  await page.click('.pv-pill');
  await page.waitForSelector('.pv-editor');
  ok((await page.textContent('.pv-editor .pv-kind')) === 'quote', 'selection opens editor kind=quote');
  await page.fill('.pv-ta', 'Also mention this in the PR description.');
  await page.click('.pv-btn-primary');
  ok(await page.isVisible('#q-priority mark.pv-mark'), 'quote wrapped in a mark');

  // delete the quote comment
  await page.locator('#q-priority .q-comment button', { hasText: 'Delete' }).click();
  ok((await page.locator('#q-priority .q-comment').count()) === 0, 'deleted comment card removed');
  ok((await page.locator('#q-priority mark.pv-mark').count()) === 0, 'deleted comment unwraps its mark');

  // full submit → drawer with payload
  await page.click('#submit-btn');
  await page.waitForSelector('.drawer.open');
  ok((await page.locator('#unanswered-panel.show').count()) === 0, 'complete submit skips the panel');
  const payload = JSON.parse(await page.textContent('#drawer-json'));
  ok(payload.verdict === 'approve-with-changes', 'payload verdict');
  ok(payload.answers['q-arch'] === 'agree', 'architecture answer carried');
  ok(payload.answers['q-theme'] === 4, 'scale answer is a number');
  ok(deepEq(payload.answers['q-priority'], ['theme', 'target-model', 'rendering', 'ask']),
     'rank answer is the ordered array');
  ok(payload.comments.length === 3, 'payload has note + 2 anchored comments', String(payload.comments.length));
  const note = payload.comments.find(c => !c.target && c.anchor === '#q-legacy');
  ok(!!note, 'plain note kept its shape');
  const nodeC = payload.comments.find(c => c.target && c.target.kind === 'diagram-node');
  ok(nodeC && nodeC.target.diagram === 'after' && nodeC.target.nodeId === 'SEL',
     'node comment carries diagram + source node id', JSON.stringify(nodeC && nodeC.target));
  const optC = payload.comments.find(c => c.target && c.target.kind === 'option');
  ok(optC && optC.target.option === 'collapsible' && optC.anchor === '#q-render',
     'option comment carries the option value', JSON.stringify(optC && optC.target));
  await page.keyboard.press('Escape');
  ok((await page.locator('.drawer.open').count()) === 0, 'Esc closes the drawer');

  // demo seed
  await page.goto(BASE + '/ask.html?demo', { waitUntil: 'load' });
  ok((await page.textContent('#progress-count')).trim() === '5/8 answered', 'demo seeds 5/8');
  ok((await page.locator('#q-render .q-comment').count()) === 1, 'demo seeds an anchored option comment');
  await page.click('#submit-btn');
  ok((await page.locator('#unanswered-list li').count()) === 3, 'demo submit flags the 3 open questions');
  await page.click('#submit-anyway');
  await page.waitForSelector('.drawer.open');
  const partial = JSON.parse(await page.textContent('#drawer-json'));
  ok(partial.verdict === '' && partial.answers['q-misc'] === '',
     'partial submit carries empty verdict and empty text, not guesses');
  ok(partial.comments.length === 2, 'demo payload: note + anchored option comment');

  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e.stack || e)); process.exit(1); });
