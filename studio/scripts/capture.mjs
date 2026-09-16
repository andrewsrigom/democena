import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const html = await readFile(new URL('../fixture/index.html', import.meta.url));
const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
await mkdir('public/captures', { recursive: true });
let browser;
try {
  browser = await chromium.launch();
  const viewport = { width: 1280, height: 800 };
  const context = await browser.newContext({ viewport, recordVideo: { dir: 'public/captures', size: viewport } });
  const start = performance.now();
  const page = await context.newPage();
  const video = page.video();
  const elapsed = () => (performance.now() - start) / 1000;
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const button = page.getByRole('button', { name: 'Track', exact: true });
  await button.waitFor();
  // Settling and trailing holds keep chosen freeze frames clear of event boundaries.
  await page.waitForTimeout(1000);
  const captureStart = elapsed();
  await page.waitForTimeout(4500);
  const field = page.getByRole('textbox', { name: 'Track a parcel' });
  const fieldBox = await field.boundingBox();
  const buttonBox = await button.boundingBox();
  const lookupBox = await page.getByTestId('lookup').boundingBox();
  assert(fieldBox && buttonBox && lookupBox, 'The visible tracking form is required');
  const focusStart = elapsed() - captureStart;
  await page.waitForTimeout(4500);
  const cameraStart = elapsed() - captureStart;
  await page.waitForTimeout(900);
  await field.pressSequentially('PD-1041', { delay: 170 });
  await page.waitForTimeout(650);
  const clickAt = elapsed() - captureStart - cameraStart;
  await button.click();
  const result = page.getByTestId('result');
  await result.filter({ hasText: 'PD-1041 is out for delivery in Rotterdam.' }).waitFor();
  assert.equal(await result.innerText(), 'PD-1041 is out for delivery in Rotterdam.');
  await page.waitForTimeout(1600);
  const cameraDuration = elapsed() - captureStart - cameraStart;
  const resultAt = elapsed() - captureStart;
  const resultBox = await result.boundingBox();
  assert(resultBox, 'The recorded result must be visible');
  await page.waitForTimeout(1800);
  const captureEnd = elapsed();
  await context.close();
  await video.saveAs('public/captures/parcel.webm');
  await video.delete();
  const sourceDuration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', 'public/captures/parcel.webm'], { encoding: 'utf8' }).trim());
  const trimBefore = Math.max(0, captureStart + sourceDuration - captureEnd);
  const scenes = [
    { id: 'opening', type: 'text', duration: 5, eyebrow: 'A little clarity goes a long way', title: 'Every workflow\nhas a story.', body: 'Turn an everyday task into a moment that makes sense.', reveal: 'words', highlight: 'story.', transition: { type: 'fade', duration: .4 } },
    { id: 'chapter-01', type: 'chapter', duration: 4, number: '01', eyebrow: 'Find a parcel', title: 'From a question\nto a clear answer.', body: 'One simple journey through Parcel Desk.', transition: { type: 'slide', duration: .5 } },
    { id: 'overview', type: 'overview', duration: 4.5, source: { from: 0 }, eyebrow: 'The workspace', title: 'A clear view.\nAt a glance.', body: 'Your parcels, destinations and delivery status in one place.' },
    { id: 'focus', type: 'focus', duration: 4.5, source: { from: focusStart }, focus: fieldBox, dim: .4, zoom: 1.35, eyebrow: 'Start here', title: 'One small field.\nThe next step.', body: 'Bring attention to the parcel code. Let the rest of the screen take a back seat.' },
    { id: 'camera', type: 'camera', duration: cameraDuration, source: { from: cameraStart }, eyebrow: 'Follow the action', title: 'Enter a code.\nFind an answer.', body: 'Follow the real interaction from the input to the Track button.', path: [
      { at: 0 }, { at: .8, focus: fieldBox, zoom: 1.65 }, { at: 2.1, focus: fieldBox, zoom: 1.65 },
      { at: clickAt - .1, focus: buttonBox, zoom: 1.6 }, { at: cameraDuration - .2, focus: lookupBox, zoom: 1.15 },
    ] },
    { id: 'annotation', type: 'annotation', duration: 6, source: { from: resultAt + .1, freeze: true }, focus: resultBox,
      note: { text: 'Destination and delivery status appear together after the lookup.', x: 680, y: 350, width: 470 },
      eyebrow: 'A moment to explain', title: 'Pause here.\nMake it clear.', body: 'Keep the result on screen while a short note explains what matters.' },
    { id: 'comparison', type: 'result', duration: 5.5, source: { from: resultAt + .1, freeze: true }, eyebrow: 'The result', title: 'From a code\nto certainty.', body: 'The same form, before and after. An answer captured from the actual application.',
      comparison: { before: cameraStart + .2, after: resultAt + .1, crop: lookupBox, beforeLabel: 'BEFORE · A PARCEL TO FIND', afterLabel: 'AFTER · AN ANSWER IN SIGHT' } },
    { id: 'closing', type: 'outro', duration: 5, eyebrow: 'Less searching. More knowing.', title: 'Every parcel.\nA clearer journey.', body: 'A simple workflow, explained through text, focus and motion.', reveal: 'lines', highlight: 'clearer journey.', cta: 'Make the next step clear', transition: { type: 'slide', duration: .5 } },
  ];
  const project = { version: 2, title: 'Parcel Desk', accent: '#28584c', video: 'captures/parcel.webm', sourceDuration, trimBefore, viewport, scenes };
  await writeFile('project.json', JSON.stringify(project, null, 2) + '\n');
  console.log(`Captured ${sourceDuration.toFixed(1)} seconds and all ${scenes.length} scene types. Edit studio/project.json to change the story.`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
