// Democena browser regression: injection before <html>, deferred scripts, reload and dismissal.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { overlayScript, defaultTheme } from '../dist/index.js';

const pending = new Set();
const server = createServer((req, res) => {
  if (req.url === '/deferred.js') { pending.add(res); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html><head><script defer src="/deferred.js"></script></head><body style="background:red"><h1>Visible application</h1></body></html>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const release = () => { for (const response of pending) { response.setHeader('Content-Type', 'application/javascript'); response.end('window.deferredLoaded = true;'); } pending.clear(); };
const browser = await chromium.launch();
let checks = 0;
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext();
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const script = overlayScript(defaultTheme);
    await context.addInitScript({ content: script });
    for (const dismissed of [false, false, true]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?run=${checks}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => document.readyState === 'interactive' && document.querySelector('h1'));
      // Do not call __demo.ready() here: it mounts the overlay and would mask an early-cover bug.
      const early = await page.evaluate(() => ({ api: !!window.__demo, cover: document.documentElement.classList.contains('democena-cover'), background: getComputedStyle(document.documentElement, '::before').backgroundColor, layer: !!document.getElementById('__demo-layer'), deferred: !!window.deferredLoaded }));
      assert.equal(early.api, true);
      assert.equal(early.cover, !dismissed, 'cover must be present before deferred scripts finish unless dismissed');
      assert.equal(early.layer, false);
      assert.equal(early.deferred, false);
      if (!dismissed) assert.notEqual(early.background, 'rgba(0, 0, 0, 0)');
      release();
      await page.waitForLoadState('domcontentloaded');
      await page.evaluate(script);
      assert.equal(await page.locator('#__demo-layer').count(), 1, 'reinjection must be idempotent');
      assert.equal(await page.locator('.demo-card').evaluate((el) => el.classList.contains('hidden')), dismissed);
      if (checks % 3 === 1) await page.evaluate(() => window.__demo.hideCard());
      checks++;
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`Overlay regression passed: ${checks} navigations, early cover, deferred loading, dismissal and reinjection.`);
} finally {
  release();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
