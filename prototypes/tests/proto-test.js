#!/usr/bin/env node
/**
 * proto-test.js — interaction tests for the html-visualize improvement
 * prototypes (feedback.html, visualize.html) served on 127.0.0.1:8917.
 *
 * Drives real events (click, hover, keyboard) in headless Chromium via
 * playwright resolved from the npm _npx cache, same as the repo's
 * test-browser.js.
 */

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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => { failed++; console.log('  FAIL pageerror: ' + e.message); });

  /* ════════════ feedback.html ════════════ */
  console.log('feedback.html');
  await page.goto(BASE + '/feedback.html', { waitUntil: 'load' });
  await page.waitForSelector('.mermaid-block svg g.node', { timeout: 30000 });

  ok(await page.isHidden('.pv-pill'), 'selection pill hidden on load');
  ok((await page.textContent('#count')).trim() === '0 comments', 'count starts at 0');
  ok(await page.isVisible('#rail-empty'), 'rail empty state visible');

  // 1 ── quote: select the word "precision" in p-why, mouseup, click pill
  await page.evaluate(() => {
    const block = document.querySelector('[data-block-id="p-why"]');
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let node, idx = -1;
    while ((node = walker.nextNode())) {
      idx = node.textContent.indexOf('precision');
      if (idx !== -1) break;
    }
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + 'precision'.length);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.waitForTimeout(60);
  ok(await page.isVisible('.pv-pill'), 'pill appears after selecting a word');
  await page.click('.pv-pill');
  await page.waitForSelector('.pv-editor');
  ok((await page.textContent('.pv-editor .pv-kind')) === 'quote', 'editor opens with kind=quote');
  ok((await page.textContent('.pv-editor .pv-ctx-text')).includes('precision'), 'editor context shows the quote');
  await page.fill('.pv-ta', 'Comment on one word.');
  await page.click('.pv-btn-primary');
  ok((await page.textContent('#count')).trim() === '1 comment', 'count = 1 after quote comment');
  ok(await page.isVisible('mark.pv-mark'), 'quote wrapped in a mark');
  ok((await page.textContent('mark.pv-mark')) === 'precision', 'mark wraps exactly the selected word');
  ok(await page.isVisible('mark.pv-mark + .pv-pin'), 'pin sits after the mark');

  // 2 ── pick mode: list item
  await page.click('#pick-btn');
  ok((await page.getAttribute('#pick-btn', 'aria-pressed')) === 'true', 'pick mode toggles on');
  const li2 = page.locator('[data-block-id="list-goals"] li').nth(1);
  await li2.hover();
  ok(await li2.evaluate(el => el.classList.contains('pv-hover')), 'hovered list item gets outline');
  await li2.click();
  await page.waitForSelector('.pv-editor');
  ok((await page.textContent('.pv-editor .pv-kind')) === 'list item', 'editor kind=list item');
  ok((await page.getAttribute('#pick-btn', 'aria-pressed')) === 'false', 'pick mode auto-exits after pick');
  await page.fill('.pv-ta', 'Second bullet needs an example.');
  await page.click('.pv-btn-primary');
  ok(await li2.locator('.pv-pin').isVisible(), 'pin appended to the list item');

  // 3 ── pick mode: code line 9
  await page.click('#pick-btn');
  await page.click('.code-line[data-line="9"]');
  await page.waitForSelector('.pv-editor');
  ok((await page.textContent('.pv-editor .pv-kind')) === 'code line', 'editor kind=code line');
  await page.fill('.pv-ta', 'Why does element carry label?');
  await page.click('.pv-btn-primary');

  // 4 ── pick mode: table row 2
  await page.click('#pick-btn');
  await page.click('[data-block-id="table-targets"] tbody tr:nth-child(2)');
  await page.waitForSelector('.pv-editor');
  ok((await page.textContent('.pv-editor .pv-kind')) === 'table row', 'editor kind=table row');
  await page.fill('.pv-ta', 'block kind row comment.');
  await page.click('.pv-btn-primary');

  // 5 ── diagram node, outside pick mode
  const claudeNode = page.locator('.mermaid-block g.node', { hasText: 'Claude' }).first();
  await claudeNode.click();
  await page.waitForSelector('.pv-editor');
  ok((await page.textContent('.pv-editor .pv-kind')) === 'diagram node', 'node click opens editor kind=diagram node');
  ok((await page.textContent('.pv-editor .pv-ctx-text')) === 'Claude', 'node context is the node label');
  await page.fill('.pv-ta', 'What re-invokes Claude here?');
  await page.click('.pv-btn-primary');
  ok(await claudeNode.evaluate(el => el.classList.contains('pv-noded')), 'commented node keeps a ring');
  ok(await page.isVisible('.pv-node-pin'), 'overlay pin on the diagram node');

  ok((await page.textContent('#count')).trim() === '5 comments', 'count = 5');
  ok((await page.locator('.rail-card').count()) === 5, 'five rail cards');

  // 6 ── edit a comment from the rail
  const firstCard = page.locator('.rail-card').first();
  await firstCard.locator('.rail-edit').click();
  await page.waitForSelector('.pv-editor');
  ok((await page.inputValue('.pv-ta')) === 'Comment on one word.', 'edit pre-fills existing text');
  await page.fill('.pv-ta', 'Comment on one word — edited.');
  await page.click('.pv-btn-primary');
  ok((await page.locator('.rail-card').first().locator('.rail-text').textContent()) === 'Comment on one word — edited.',
     'card shows the edited text');

  // 7 ── delete the code-line comment
  const codeCard = page.locator('.rail-card', { hasText: 'code line' }).first();
  await codeCard.locator('.rail-del').click();
  ok((await page.textContent('#count')).trim() === '4 comments', 'count = 4 after delete');
  ok((await page.locator('.code-line[data-line="9"] .pv-pin').count()) === 0, 'deleted pin removed from code line');

  // 8 ── payload drawer
  await page.click('#apply-btn');
  await page.waitForSelector('.drawer.open');
  const payload = JSON.parse(await page.textContent('#drawer-json'));
  ok(payload.action === 'apply', 'payload action=apply');
  ok(payload.comments.length === 4, 'payload carries 4 comments');
  const kinds = payload.comments.map(c => c.target.kind).sort().join(',');
  ok(kinds === 'diagram-node,element,element,quote', 'payload kinds correct', kinds);
  const q = payload.comments.find(c => c.target.kind === 'quote');
  ok(q.target.quote === 'precision' && q.target.quoteStart >= 0, 'quote target has quote+quoteStart');
  ok(q.blockText.length > 0, 'comment carries blockText');
  const dn = payload.comments.find(c => c.target.kind === 'diagram-node');
  ok(dn.target.nodeId === 'C' && dn.target.label === 'Claude', 'diagram-node target resolves source node id',
     JSON.stringify(dn.target));
  const rowT = payload.comments.find(c => c.target.kind === 'element' && /^row:/.test(c.target.selector));
  ok(!!rowT && rowT.target.selector === 'row:2', 'table row target selector row:2');
  await page.keyboard.press('Escape');
  ok((await page.locator('.drawer.open').count()) === 0, 'Esc closes the drawer');

  // 9 ── Esc exits pick mode
  await page.click('#pick-btn');
  await page.keyboard.press('Escape');
  ok((await page.getAttribute('#pick-btn', 'aria-pressed')) === 'false', 'Esc exits pick mode');

  // 10 ── theme flip: mermaid re-renders, node comment survives
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(2500);
  const noded = await page.locator('.mermaid-block g.node.pv-noded').count();
  ok(noded === 1, 'node ring survives dark-mode re-render');
  ok(await page.isVisible('.pv-node-pin'), 'node pin survives dark-mode re-render');
  ok((await page.locator('.rail-card').count()) === 4, 'rail intact after re-render');
  await page.emulateMedia({ colorScheme: 'light' });

  /* ════════════ visualize.html ════════════ */
  console.log('visualize.html');
  await page.goto(BASE + '/visualize.html', { waitUntil: 'load' });
  await page.waitForSelector('#arch-block svg g.node', { timeout: 30000 });

  // 1 ── bar tooltip
  await page.hover('.bar-row[data-file="feedback/app.js"]');
  await page.waitForSelector('.chart-tip');
  ok((await page.textContent('.chart-tip')).includes('585 lines'), 'bar tooltip shows lines + share');

  // 2 ── point-at: bar, then table row
  await page.click('#point-btn');
  await page.click('.bar-row[data-file="bin/server.js"]');
  ok((await page.locator('.chip').count()) === 1, 'bar reference chip added');
  ok((await page.textContent('.chip .chip-label')) === 'bin/server.js', 'chip labels the bar');
  await page.click('#point-btn');
  await page.click('.table-card tbody tr:nth-child(1)');
  ok((await page.locator('.chip').count()) === 2, 'table row chip added');

  // 3 ── diagram node reference without pick mode; duplicate rejected
  const coreNode = page.locator('#arch-block g.node', { hasText: 'skills/html-visualize' }).first();
  await coreNode.click();
  ok((await page.locator('.chip').count()) === 3, 'diagram node chip added by direct click');
  ok(await coreNode.evaluate(el => el.classList.contains('pv-reffed')), 'referenced node gets a ring');
  await coreNode.click();
  ok((await page.locator('.chip').count()) === 3, 'duplicate reference rejected');
  ok(await page.isVisible('.toast.show'), 'duplicate shows a toast');

  // 4 ── remove a chip
  await page.locator('.chip').first().locator('button').click();
  ok((await page.locator('.chip').count()) === 2, 'chip removed via ×');

  // 5 ── send payload
  await page.fill('#freeform', 'Test message.');
  await page.click('#send-btn');
  await page.waitForSelector('.drawer.open');
  const vp = JSON.parse(await page.textContent('#drawer-json'));
  ok(vp.freeform === 'Test message.', 'payload freeform carried');
  ok(vp.references.length === 2, 'payload has 2 references');
  const vkinds = vp.references.map(r => r.kind).sort().join(',');
  ok(vkinds === 'diagram-node,table-row', 'reference kinds correct', vkinds);
  const vdn = vp.references.find(r => r.kind === 'diagram-node');
  ok(vdn.nodeId === 'CORE', 'node reference resolves source id', JSON.stringify(vdn));
  await page.keyboard.press('Escape');

  // 6 ── scrollspy
  await page.locator('#suites').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  ok((await page.textContent('#toc a.active')).trim() === 'Script tests', 'scrollspy tracks the visible section');

  // 7 ── collapsible code section
  ok((await page.locator('details.code-fold[open]').count()) === 1, 'code section starts open');
  await page.click('details.code-fold summary');
  ok((await page.locator('details.code-fold[open]').count()) === 0, 'summary click folds the code');

  // 8 ── save toast
  await page.click('#save-btn');
  ok(await page.isVisible('.toast.show'), 'Save shows the prototype toast');

  // 9 ── dark flip keeps node reference
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(2500);
  ok((await page.locator('#arch-block g.node.pv-reffed').count()) === 1, 'node ring survives dark-mode re-render');
  ok((await page.locator('.chip').count()) === 2, 'chips intact after re-render');

  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e.stack || e)); process.exit(1); });
