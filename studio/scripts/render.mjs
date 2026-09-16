import assert from 'node:assert/strict';
import { readFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { chromium } from 'playwright';

const inputProps = JSON.parse(await readFile('project.json', 'utf8').catch(() => { throw new Error('Run npm run studio:capture from the repository root first.'); }));
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
assert(finite(inputProps.duration) && inputProps.duration > 0, 'duration must be positive');
assert(finite(inputProps.trimBefore) && inputProps.trimBefore >= 0, 'trimBefore must be nonnegative');
assert(finite(inputProps.viewport?.width) && inputProps.viewport.width > 0 && finite(inputProps.viewport?.height) && inputProps.viewport.height > 0, 'viewport must be positive');
assert(/^#[0-9a-f]{6}$/i.test(inputProps.accent), 'accent must be a six-digit hex color');
assert(typeof inputProps.title === 'string', 'title is required');
assert(typeof inputProps.video === 'string', 'video is required');
const media = path.resolve('public', inputProps.video);
assert(media.startsWith(path.resolve('public') + path.sep), 'video must be inside studio/public');
await access(media);
assert(Array.isArray(inputProps.scenes) && inputProps.scenes.length > 0 && inputProps.scenes[0].at === 0, 'scenes must start at zero');
let previous = -1;
for (const scene of inputProps.scenes) {
  assert(finite(scene.at) && scene.at > previous && scene.at < inputProps.duration, 'scene times must increase within duration');
  previous = scene.at;
  for (const key of ['eyebrow', 'title', 'body']) assert(typeof scene[key] === 'string', `scene.${key} is required`);
  if (scene.focus) {
    for (const key of ['x', 'y', 'width', 'height']) assert(finite(scene.focus[key]) && scene.focus[key] >= 0, `focus.${key} must be nonnegative`);
    assert(scene.focus.width > 0 && scene.focus.height > 0, 'focus size must be positive');
  }
}
await mkdir('output', { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.tsx'), publicDir: path.resolve('public') });
const browserExecutable = chromium.executablePath();
const puppeteerInstance = await openBrowser('chrome', { browserExecutable });
try {
  const composition = await selectComposition({ serveUrl, id: 'Democena', inputProps, puppeteerInstance });
  await renderStill({ composition, serveUrl, inputProps, puppeteerInstance, frame: Math.min(composition.durationInFrames - 1, Math.round((inputProps.scenes.at(-1).at + 1) * 30)), output: 'output/preview.png' });
  let last = -1;
  if (!process.argv.includes('--still')) await renderMedia({ composition, serveUrl, inputProps, puppeteerInstance, codec: 'h264', outputLocation: 'output/democena.mp4', concurrency: 2, crf: 19, onProgress: ({ progress }) => {
    const bucket = Math.floor(progress * 10);
    if (bucket !== last) { last = bucket; console.log(`Rendering ${bucket * 10}%`); }
  } });
  console.log(process.argv.includes('--still') ? 'Rendered studio/output/preview.png' : 'Rendered studio/output/democena.mp4 and preview.png');
} finally {
  await puppeteerInstance.close({ silent: true });
}
