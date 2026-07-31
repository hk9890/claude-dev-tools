#!/usr/bin/env node
/* size-test.js — responsive checks for the prototypes at multiple viewports. */
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

const SHOTS = path.join(os.tmpdir(), 'htmlviz-proto-shots');
fs.mkdirSync(SHOTS, { recursive: true });

const WIDTHS = [360, 390, 768, 1024, 1440];
let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch();
  for (const file of ['feedback.html', 'visualize.html', 'ask.html', 'index.html']) {
    console.log(file);
    for (const w of WIDTHS) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.goto(BASE + '/' + file + '?demo', { waitUntil: 'load' });
      try { await page.waitForSelector('svg g.node', { timeout: 15000 }); } catch (e) {}
      await page.waitForTimeout(400);

      // 1. No horizontal page overflow (wide content must scroll in its own box)
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(over <= 1, w + 'px: no horizontal page overflow', 'overflows by ' + over + 'px');

      // 2. Action bar (when present) fits inside the viewport
      const ab = await page.$('.actionbar');
      if (ab) {
        const box = await ab.boundingBox();
        ok(box.x >= 0 && box.x + box.width <= w + 1, w + 'px: action bar fits',
           JSON.stringify(box));
      }

      // 3. feedback: rail placement switches at the 1080px breakpoint
      if (file === 'feedback.html') {
        const railStatic = await page.evaluate(() => {
          const c = document.querySelector('.rail-card');
          return c ? getComputedStyle(c).position : 'none';
        });
        if (w <= 1080) ok(railStatic === 'static' || railStatic === 'none',
                          w + 'px: rail cards flow under the document', railStatic);
        else ok(railStatic === 'absolute', w + 'px: rail cards float in the margin', railStatic);
      }

      // 4. visualize: chart bar rows keep their 3 columns without collapsing
      if (file === 'visualize.html') {
        const barOk = await page.evaluate(() => {
          const row = document.querySelector('.bar-row');
          const track = row.querySelector('.bar-track');
          return track.getBoundingClientRect().width > 40;
        });
        ok(barOk, w + 'px: chart track keeps usable width');
      }

      if (w === 390 || w === 768) {
        await page.screenshot({ path: `${SHOTS}/${file.replace('.html','')}-${w}.png`, fullPage: w === 390 });
      }
      await page.close();
    }
  }
  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e.stack || e)); process.exit(1); });
