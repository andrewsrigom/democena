import assert from 'node:assert/strict';
import { readFile, mkdir, access, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { chromium } from 'playwright';
import { buildTimeline } from '../src/timeline-layout.mjs';

const { values } = parseArgs({ options: { project: { type: 'string', default: 'project.json' }, 'public-dir': { type: 'string', default: 'public' }, output: { type: 'string', default: 'output' }, still: { type: 'boolean', default: false } } });
const studioRoot = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.resolve(values['public-dir']);
const outputDir = path.resolve(values.output);
const inputProps = JSON.parse(await readFile(path.resolve(values.project), 'utf8'));
assert(typeof inputProps.video === 'string', 'video is required');
const media = path.resolve(publicDir, inputProps.video);
assert(!inputProps.video || media.startsWith(publicDir + path.sep), 'video must be inside the public directory');
const logo = inputProps.branding?.logo;
if (logo) {
  const brandAsset = path.resolve(publicDir, logo);
  assert(brandAsset.startsWith(publicDir + path.sep), 'branding logo must be inside the public directory');
  await access(brandAsset);
}
const needsVideo = Array.isArray(inputProps.scenes) && inputProps.scenes.some((scene) => !['text', 'chapter', 'outro'].includes(scene.type));
if (needsVideo) {
  await access(media);
  // Validate against the real media, even when a hand-edited manifest has a stale duration.
  inputProps.sourceDuration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', media], { encoding: 'utf8' }).trim());
}
await mkdir(path.join(outputDir, 'scenes'), { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(studioRoot, 'src/index.tsx'), publicDir });
const puppeteerInstance = await openBrowser('chrome', { browserExecutable: chromium.executablePath() });
try {
  // calculateMetadata normalizes old manifests and validates every scene for Studio and export.
  const composition = await selectComposition({ serveUrl, id: 'Democena', inputProps, puppeteerInstance });
  const props = composition.props;
  const stills = [];
  const timeline = buildTimeline(props.scenes, composition.fps);
  for (const [i, { scene, from, duration, previewFrame: frame }] of timeline.entries()) {
    // Filenames use an index and validated type, never a user-supplied ID or title.
    const output = path.join(outputDir, 'scenes', `${String(i + 1).padStart(2, '0')}-${scene.type}.png`);
    await renderStill({ composition, serveUrl, inputProps: props, puppeteerInstance, frame, output });
    stills.push({ id: scene.id, type: scene.type, from, duration, frame, output });
    console.log(`Preview ${i + 1}/${props.scenes.length}: ${scene.type}`);
  }
  await writeFile(path.join(outputDir, 'storyboard.json'), JSON.stringify({ fps: composition.fps, durationInFrames: composition.durationInFrames, scenes: stills }, null, 2) + '\n');
  const previewFrame = stills.find((scene) => scene.type === 'focus')?.frame ?? stills[0].frame;
  await renderStill({ composition, serveUrl, inputProps: props, puppeteerInstance, frame: previewFrame, output: path.join(outputDir, 'preview.png') });
  let last = -1;
  if (!values.still) await renderMedia({ composition, serveUrl, inputProps: props, puppeteerInstance, codec: 'h264', outputLocation: path.join(outputDir, 'democena.mp4'), concurrency: 2, crf: 19, onProgress: ({ progress }) => {
    const bucket = Math.floor(progress * 10);
    if (bucket !== last) { last = bucket; console.log(`Rendering ${bucket * 10}%`); }
  } });
  console.log(`Rendered ${values.still ? 'scene previews' : 'MP4 and scene previews'} in ${outputDir}`);
} finally {
  await puppeteerInstance.close({ silent: true });
}
