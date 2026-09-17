// Clean capture shared by Studio and the optional agent interface.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function httpOrigin(value) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      'Capture URLs must use HTTP(S) without embedded credentials.',
    );
  return url.origin;
}
function locate(page, target) {
  if (target.testId) return page.getByTestId(target.testId);
  if (target.label) return page.getByLabel(target.label, { exact: true });
  if (target.role)
    return page.getByRole(target.role, { name: target.name, exact: true });
  if (target.css) return page.locator(target.css);
  throw new Error('A target needs testId, label, role/name or css.');
}
export async function captureBrowser(plan, output, options = {}) {
  const origin = httpOrigin(plan.url);
  const allowed = new Set([
    origin,
    ...(plan.allowedOrigins ?? []).map(httpOrigin),
  ]);
  if (!plan.steps.some((step) => step.action === 'expect'))
    throw new Error(
      'Capture needs at least one assertion of the application outcome.',
    );
  const ids = new Set();
  for (const step of plan.steps) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(step.id) || ids.has(step.id))
      throw new Error('Capture step IDs must be unique lowercase identifiers.');
    ids.add(step.id);
    if (
      step.action === 'goto' &&
      !allowed.has(httpOrigin(new URL(step.url, plan.url).href))
    )
      throw new Error('Navigation URL is outside the allowed origins.');
  }
  const viewport = plan.viewport ?? { width: 1280, height: 800 };
  await mkdir(path.join(output, 'marks'), { recursive: true });
  const browser = await chromium.launch();
  const events = [];
  let context,
    page,
    started = false,
    timedOut = false,
    blockedURL;
  const timeout = setTimeout(() => {
    timedOut = true;
    void browser.close();
  }, plan.timeoutMs ?? 120000);
  const recording = path.join(output, 'capture.webm');
  let firstFrame, firstFrameMonotonic, lastFrame;
  try {
    context = await browser.newContext({
      viewport,
      storageState: options.storageState,
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    context.setDefaultTimeout(10000);
    const redactions = plan.redact ?? [];
    if (redactions.length)
      await context.addInitScript((selectors) => {
        // Install before first paint and on every navigation, including dynamically added elements.
        const install = () => {
          if (
            !document.documentElement ||
            document.getElementById('__democena-redact')
          )
            return;
          const style = document.createElement('style');
          style.id = '__democena-redact';
          document.documentElement.append(style);
          for (const selector of selectors)
            style.sheet.insertRule(
              `${selector} { visibility: hidden !important; }`,
            );
        };
        new MutationObserver(install).observe(document, {
          childList: true,
          subtree: true,
        });
        install();
      }, redactions);
    page = await context.newPage();
    // Playwright route handlers do not revisit every redirect. Chromium's Fetch domain
    // pauses each document request, including redirected requests, before it reaches the network.
    const session = await context.newCDPSession(page);
    const { frameTree } = await session.send('Page.getFrameTree');
    let interceptionError;
    session.on(
      'Fetch.requestPaused',
      async ({ requestId, request, frameId }) => {
        let permitted = true;
        if (frameId === frameTree.frame.id) {
          try {
            permitted = allowed.has(httpOrigin(request.url));
          } catch {
            permitted = false;
          }
        }
        try {
          if (!permitted) {
            blockedURL = new URL(request.url).origin;
            await session.send('Fetch.failRequest', {
              requestId,
              errorReason: 'BlockedByClient',
            });
          } else await session.send('Fetch.continueRequest', { requestId });
        } catch {
          interceptionError = 'Navigation interception stopped unexpectedly.';
        }
      },
    );
    await session.send('Fetch.enable', {
      patterns: [{ resourceType: 'Document', requestStage: 'Request' }],
    });
    page.on('popup', (popup) => {
      void popup.close();
    });
    await page.goto(plan.url, { waitUntil: 'domcontentloaded' });
    if (blockedURL)
      throw new Error(`Navigation left the allowed origins: ${blockedURL}`);
    // Catch invalid selectors before recording rather than leaking a supposedly hidden element.
    await page.evaluate((selectors) => {
      for (const s of selectors) {
        document.querySelector(s);
        const style = document.getElementById('__democena-redact');
        if (!style?.sheet || style.sheet.cssRules.length !== selectors.length)
          throw new Error('Redaction stylesheet could not be installed.');
      }
    }, redactions);
    if (plan.ready)
      await locate(page, plan.ready).waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    let receiveFirst;
    const first = new Promise((resolve) => {
      receiveFirst = resolve;
    });
    await page.screencast.start({
      path: recording,
      size: viewport,
      onFrame: (frame) => {
        firstFrame ??= frame.timestamp;
        firstFrameMonotonic ??= performance.now();
        lastFrame = frame.timestamp;
        receiveFirst();
      },
    });
    started = true;
    let firstTimer;
    try {
      await Promise.race([
        first,
        new Promise((_, reject) => {
          firstTimer = setTimeout(
            () => reject(new Error('No browser frames arrived.')),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(firstTimer);
    }
    // Wall clocks can jump backwards when WSL or the host resynchronizes time. A monotonic clock
    // keeps action events ordered while the first presented frame remains the recording origin.
    const at = () => Math.max(0, (performance.now() - firstFrameMonotonic) / 1000);
    for (const [index, step] of plan.steps.entries()) {
      if (timedOut) throw new Error('Capture timed out.');
      let box, boxAt;
      const target = step.target ? locate(page, step.target) : undefined;
      try {
        if (target && !['expect', 'mark'].includes(step.action)) {
          await target.waitFor({ state: 'visible' });
          await target.scrollIntoViewIfNeeded();
          await page.waitForTimeout(120);
          box = await target.boundingBox();
          if (box) boxAt = at();
        }
        const event = {
          id: step.id,
          action: step.action,
          at: at(),
          url: new URL(page.url()).origin + new URL(page.url()).pathname,
          ...(box ? { box } : {}),
          ...(boxAt !== undefined ? { boxAt } : {}),
        };
        switch (step.action) {
          case 'click':
            await target.click();
            break;
          case 'fill':
            if ((await target.getAttribute('type')) === 'password')
              throw new Error(
                'Use a saved authentication state instead of recording password entry.',
              );
            await target.fill('');
            await target.pressSequentially(step.value, {
              delay: plan.typingDelayMs ?? 60,
            });
            break;
          case 'select':
            await target.selectOption({ label: step.value });
            break;
          case 'press':
            await target.press(step.key);
            break;
          case 'scroll':
            await target.scrollIntoViewIfNeeded();
            break;
          case 'goto':
            await page.goto(new URL(step.url, plan.url).href, {
              waitUntil: 'domcontentloaded',
            });
            break;
          case 'wait':
            await page.waitForTimeout(step.durationMs);
            break;
          case 'expect':
            if (step.text !== undefined)
              await expect(target).toHaveText(step.text);
            else await expect(target).toBeVisible();
            event.verified = true;
            box = await target.boundingBox();
            if (box) {
              event.box = box;
              event.boxAt = at();
            }
            break;
          case 'mark': {
            if (target) {
              await target.waitFor({ state: 'visible' });
              await target.scrollIntoViewIfNeeded();
            }
            await page.waitForTimeout(120);
            event.at = at();
            if (target) {
              box = await target.boundingBox();
              if (box) {
                event.box = box;
                event.boxAt = at();
              }
            }
            event.screenshot = path.join(output, 'marks', `${step.id}.png`);
            await page.screenshot({ path: event.screenshot });
            break;
          }
          default:
            throw new Error(`Unsupported action ${step.action}`);
        }
        if (blockedURL)
          throw new Error(`Navigation left the allowed origins: ${blockedURL}`);
        event.end = at();
        events.push(event);
        await page.waitForTimeout(step.holdMs ?? 200);
        if (blockedURL)
          throw new Error(`Navigation left allowed origins: ${blockedURL}`);
      } catch (error) {
        // Do not copy input values or Playwright call logs into job errors.
        const reason = timedOut
          ? 'capture deadline exceeded'
          : blockedURL
            ? 'navigation left allowed origins'
            : `${step.action} failed; check target, page state and expected outcome`;
        throw new Error(`Capture step ${index + 1} (${step.id}): ${reason}.`, {
          cause: error,
        });
      }
    }
    await page.waitForTimeout(600);
    if (blockedURL)
      throw new Error(`Navigation left allowed origins: ${blockedURL}`);
    if (interceptionError) throw new Error(interceptionError);
    const preview = path.join(output, 'preview.png');
    await page.screenshot({ path: preview });
    await page.screencast.stop();
    started = false;
    const result = {
      recording,
      preview,
      viewport,
      events,
      clock: {
        method: 'browser-presented-frame',
        firstFrameTimestamp: firstFrame,
        lastFrameTimestamp: lastFrame,
        precision:
          'approximate; browser frame sampling and action scheduling still apply',
      },
    };
    await writeFile(
      path.join(output, 'capture.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
    return result;
  } finally {
    clearTimeout(timeout);
    if (started) await page?.screencast.stop().catch(() => {});
    await context?.close().catch(() => {});
    await browser.close();
  }
}
