import assert from 'node:assert/strict';
import { readFile, mkdir, access, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { chromium } from 'playwright';

const inputProps = JSON.parse(await readFile('project.json', 'utf8').catch(() => { throw new Error('Run npm run studio:capture from the repository root first.'); }));
assert(typeof inputProps.video === 'string', 'video is required');
const media = path.resolve('public', inputProps.video);
assert(media.startsWith(path.resolve('public') + path.sep), 'video must be inside studio/public');
const needsVideo = Array.isArray(inputProps.scenes) && inputProps.scenes.some((scene) => !['text', 'chapter', 'outro'].includes(scene.type));
if (needsVideo) {
  await access(media);
  // Validate against the real media, even when a hand-edited manifest has a stale duration.
  inputProps.sourceDuration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', media], { encoding: 'utf8' }).trim());
}
await mkdir('output/scenes', { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.tsx'), publicDir: path.resolve('public') });
const puppeteerInstance = await openBrowser('chrome', { browserExecutable: chromium.executablePath() });
try {
  // calculateMetadata normalizes old manifests and validates every scene for Studio and export.
  const composition = await selectComposition({ serveUrl, id: 'Democena', inputProps, puppeteerInstance });
  const props = composition.props;
  const stills = [];
  let end = 0;
  for (const [i, scene] of props.scenes.entries()) {
    const duration = Math.round(scene.duration * composition.fps);
    const transition = scene.transition ?? { type: 'fade', duration: .4 };
    const overlap = i === 0 || transition.type === 'none' ? 0 : Math.round(transition.duration * composition.fps);
    const from = end - overlap;
    end = from + duration;
    const frame = from + Math.min(duration - 1, Math.max(overlap, Math.round(duration * .65)));
    // Filenames use an index and validated type, never a user-supplied ID or title.
    const output = `output/scenes/${String(i + 1).padStart(2, '0')}-${scene.type}.png`;
    await renderStill({ composition, serveUrl, inputProps: props, puppeteerInstance, frame, output });
    stills.push({ id: scene.id, type: scene.type, from, duration, frame, output });
    console.log(`Preview ${i + 1}/${props.scenes.length}: ${scene.type}`);
  }
  await writeFile('output/storyboard.json', JSON.stringify({ fps: composition.fps, durationInFrames: composition.durationInFrames, scenes: stills }, null, 2) + '\n');
  const previewFrame = stills.find((scene) => scene.type === 'focus')?.frame ?? stills[0].frame;
  await renderStill({ composition, serveUrl, inputProps: props, puppeteerInstance, frame: previewFrame, output: 'output/preview.png' });
  let last = -1;
  if (!process.argv.includes('--still')) await renderMedia({ composition, serveUrl, inputProps: props, puppeteerInstance, codec: 'h264', outputLocation: 'output/democena.mp4', concurrency: 2, crf: 19, onProgress: ({ progress }) => {
    const bucket = Math.floor(progress * 10);
    if (bucket !== last) { last = bucket; console.log(`Rendering ${bucket * 10}%`); }
  } });
  console.log(process.argv.includes('--still') ? 'Rendered scene previews in studio/output/scenes' : 'Rendered studio/output/democena.mp4 and all scene previews');
} finally {
  await puppeteerInstance.close({ silent: true });
}
