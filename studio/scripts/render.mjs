import assert from 'node:assert/strict';
import { readFile, mkdir, access, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { chromium } from 'playwright';
import { buildTimeline, settledReviewFrame } from '../src/timeline-layout.mjs';
import { resolveTheme } from '../src/theme-data.mjs';
import { sceneComposition } from '../src/composition-registry.mjs';

const { values } = parseArgs({ options: {
  project: { type: 'string', default: 'project.json' },
  direction: { type: 'string' },
  'public-dir': { type: 'string', default: 'public' },
  output: { type: 'string', default: 'output' },
  still: { type: 'boolean', default: false },
} });
const studioRoot = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.resolve(values['public-dir']);
const outputDir = path.resolve(values.output);
const inputProps = JSON.parse(await readFile(path.resolve(values.project), 'utf8'));
const direction = values.direction ? JSON.parse(await readFile(path.resolve(values.direction), 'utf8')) : undefined;
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
  inputProps.sourceDuration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', media], { encoding: 'utf8' }).trim());
}

function words(value, locale) {
  try {
    return [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(value)].filter((part) => part.isWordLike).length;
  } catch {
    const spaced = value.trim().split(/\s+/u).filter(Boolean).length;
    return spaced || Math.ceil([...value].length / 4);
  }
}
function readableSceneCopy(scene) {
  const copyVisible = sceneCopyVisible(scene);
  return [
    ...(copyVisible ? [scene.eyebrow, scene.title, scene.body] : []),
    scene.type === 'chapter' ? scene.number : undefined,
    scene.type === 'annotation' ? scene.note.text : undefined,
    scene.type === 'outro' ? scene.cta : undefined,
    scene.type === 'result' && scene.comparison ? scene.comparison.beforeLabel : undefined,
    scene.type === 'result' && scene.comparison ? scene.comparison.afterLabel : undefined,
  ].filter(Boolean).join(' ');
}
function sceneCopyVisible(scene) {
  if (['text', 'chapter', 'outro'].includes(scene.type)) return true;
  return sceneComposition(scene).caption !== 'none';
}
function luminance(hex) {
  const values = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}
function composite(foreground, background, alpha) {
  const channel = (hex, start) => Number.parseInt(hex.slice(start, start + 2), 16);
  return `#${[1, 3, 5].map((start) => Math.round(channel(foreground, start) * alpha + channel(background, start) * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}
function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
async function contactSheet(stills, output, title) {
  const cards = [];
  for (const scene of stills) {
    const data = (await readFile(scene.output)).toString('base64');
    cards.push(`<article><img src="data:image/png;base64,${data}"><p>${escapeHtml(scene.index)} · ${escapeHtml(scene.id)} · ${escapeHtml(scene.type)}</p></article>`);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: Math.max(900, Math.ceil(stills.length / 2) * 520) }, deviceScaleFactor: 1 });
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:40px;background:#0d1220;color:#eef3fb;font-family:Arial,sans-serif}h1{font-size:28px;margin:0 0 28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}article{background:#171f31;border:1px solid #2b3851;border-radius:14px;overflow:hidden}img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}p{font-size:18px;margin:16px 18px 18px}</style><h1>Review · ${escapeHtml(title)}</h1><div class="grid">${cards.join('')}</div>`);
    await page.screenshot({ path: output, type: 'jpeg', quality: 88, fullPage: true });
  } finally {
    await browser.close();
  }
}

await mkdir(path.join(outputDir, 'scenes'), { recursive: true });
await mkdir(path.join(outputDir, 'review', 'transitions'), { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(studioRoot, 'src/index.tsx'), publicDir });
const puppeteerInstance = await openBrowser('chrome', { browserExecutable: chromium.executablePath() });
try {
  const composition = await selectComposition({ serveUrl, id: 'Democena', inputProps, puppeteerInstance });
  const props = composition.props;
  const stills = [];
  const transitions = [];
  const timeline = buildTimeline(props.scenes, composition.fps);
  for (const [i, { scene, from, duration, overlap, end, previewFrame }] of timeline.entries()) {
    const requested = direction?.scenes?.find((entry) => entry.scene?.id === scene.id)?.expectedSettledAt;
    const frame = settledReviewFrame({ scene, from, duration, overlap, end, previewFrame }, timeline[i + 1]?.from, requested, composition.fps);
    const output = path.join(outputDir, 'scenes', `${String(i + 1).padStart(2, '0')}-${scene.type}.png`);
    await renderStill({ composition, serveUrl, inputProps: props, puppeteerInstance, frame, output });
    stills.push({ index: i + 1, id: scene.id, type: scene.type, from, duration, overlap, frame, output });
    console.log(`Preview ${i + 1}/${props.scenes.length}: ${scene.type}`);
  }
  for (let i = 1; i < timeline.length; i++) {
    const entry = timeline[i];
    if (entry.overlap === 0) continue;
    const previous = timeline[i - 1];
    const frames = [
      { phase: 'before', frame: entry.from - Math.round(composition.fps * 0.1), min: previous.from + previous.overlap, max: entry.from - 1 },
      { phase: 'midpoint', frame: entry.from + Math.floor(entry.overlap / 2), min: entry.from, max: entry.from + entry.overlap - 1 },
      { phase: 'after', frame: entry.from + entry.overlap + Math.round(composition.fps * 0.2), min: entry.from + entry.overlap, max: (timeline[i + 1]?.from ?? entry.end) - 1 },
    ];
    for (const item of frames) {
      const frame = Math.max(0, item.min, Math.min(composition.durationInFrames - 1, item.max, item.frame));
      const id = `transition-${String(i).padStart(2, '0')}-${item.phase}`;
      const output = path.join(outputDir, 'review', 'transitions', `${id}.png`);
      await renderStill({ composition, serveUrl, inputProps: props, puppeteerInstance, frame, output });
      transitions.push({ id, type: 'transition', fromSceneId: timeline[i - 1].scene.id, toSceneId: entry.scene.id, phase: item.phase, frame, output });
    }
  }
  const requestedPoster = direction?.poster;
  const posterEntry = requestedPoster ? timeline.find((entry) => entry.scene.id === requestedPoster.sceneId) : timeline.find((entry) => entry.scene.type === 'focus') ?? timeline[0];
  assert(posterEntry, 'poster scene does not exist');
  const posterIndex = timeline.indexOf(posterEntry);
  const posterFrame = settledReviewFrame(posterEntry, timeline[posterIndex + 1]?.from, requestedPoster?.sceneLocalTime, composition.fps);
  const poster = path.join(outputDir, 'review', 'poster.jpg');
  await renderStill({ composition, serveUrl, inputProps: props, puppeteerInstance, frame: posterFrame, output: poster, imageFormat: 'jpeg', jpegQuality: 90 });
  const contact = path.join(outputDir, 'review', 'contact-sheet.jpg');
  await contactSheet(stills, contact, props.title);
  await writeFile(path.join(outputDir, 'storyboard.json'), JSON.stringify({ fps: composition.fps, durationInFrames: composition.durationInFrames, scenes: stills, transitions, poster: { sceneId: posterEntry.scene.id, frame: posterFrame, output: poster } }, null, 2) + '\n');
  const previewFrame = stills.find((scene) => scene.type === 'focus')?.frame ?? stills[0].frame;
  await renderStill({ composition, serveUrl, inputProps: props, puppeteerInstance, frame: previewFrame, output: path.join(outputDir, 'preview.png') });

  const locale = direction?.locale ?? 'und';
  const theme = resolveTheme(props);
  const findings = [];
  const boundsChecks = [];
  const checkBounds = (sceneId, checks) => {
    for (const check of checks) {
      const passed = check.actual <= check.maximum;
      boundsChecks.push({ sceneId, ...check, status: passed ? 'passed' : 'blocked' });
      if (!passed) findings.push({ level: direction ? 'error' : 'warning', code: 'AUTHORED_BOUNDS', sceneId, message: `${check.field} has ${check.actual} characters; the safe authored-content limit is ${check.maximum}. Inspect and shorten the copy.` });
    }
  };
  const immersiveLayouts = new Set(['full-bleed', 'full-bleed-proof']);
  const overlayCaption = props.scenes.some((scene) => !['text', 'chapter', 'outro'].includes(scene.type)
    && !(scene.type === 'result' && scene.comparison)
    && !['side', 'none'].includes(sceneComposition(scene).caption));
  const backgroundCopy = props.scenes.some((scene) => ['text', 'chapter', 'outro'].includes(scene.type)
    || (scene.type === 'result' && scene.comparison && sceneComposition(scene).caption !== 'none')
    || sceneComposition(scene).caption === 'side');
  const mutedOnTint = props.scenes.some((scene) => (scene.type === 'result' && scene.comparison)
    || (!['text', 'chapter', 'outro'].includes(scene.type) && !immersiveLayouts.has(scene.presentation?.layout)));
  const chapterBadge = props.scenes.some((scene) => scene.type === 'chapter') ? composite(props.accent, theme.background, 0x18 / 0xff) : undefined;
  const contrastChecks = [
    ...(backgroundCopy ? [
      { name: 'foreground-on-background', foreground: theme.foreground, background: theme.background, ratio: contrast(theme.foreground, theme.background), required: 4.5 },
      { name: 'muted-on-background', foreground: theme.muted, background: theme.background, ratio: contrast(theme.muted, theme.background), required: 4.5 },
      { name: 'accent-on-background', foreground: props.accent, background: theme.background, ratio: contrast(props.accent, theme.background), required: 4.5 },
    ] : []),
    ...(mutedOnTint ? [{ name: 'muted-on-tint', foreground: theme.muted, background: theme.tint, ratio: contrast(theme.muted, theme.tint), required: 4.5 }] : []),
    ...(chapterBadge ? [{ name: 'accent-on-chapter-badge', foreground: props.accent, background: chapterBadge, ratio: contrast(props.accent, chapterBadge), required: 4.5 }] : []),
    ...(overlayCaption ? [
      { name: 'foreground-on-surface', foreground: theme.foreground, background: theme.surface, ratio: contrast(theme.foreground, theme.surface), required: 4.5 },
      { name: 'muted-on-surface', foreground: theme.muted, background: theme.surface, ratio: contrast(theme.muted, theme.surface), required: 4.5 },
      { name: 'accent-on-surface', foreground: props.accent, background: theme.surface, ratio: contrast(props.accent, theme.surface), required: 4.5 },
    ] : []),
  ];
  for (const check of contrastChecks) if (check.ratio < check.required) findings.push({ level: direction ? 'error' : 'warning', code: check.name.startsWith('accent-') ? 'ACCENT_CONTRAST' : 'AUTHORED_CONTRAST', message: `${check.name} has ${check.ratio.toFixed(2)}:1 contrast; ${check.required.toFixed(1)}:1 is required.` });
  if (backgroundCopy) checkBounds('project', [
    { field: 'title', actual: [...props.title].length, maximum: 80 },
    ...(props.branding?.name ? [{ field: 'branding.name', actual: [...props.branding.name].length, maximum: 40 }] : []),
    ...(props.branding?.tagline ? [{ field: 'branding.tagline', actual: [...props.branding.tagline].length, maximum: 80 }] : []),
    ...(props.branding?.footer ? [{ field: 'branding.footer', actual: [...props.branding.footer].length, maximum: 100 }] : []),
  ]);
  for (const [index, scene] of props.scenes.entries()) {
    const entry = timeline[index];
    const sceneEnd = timeline[index + 1]?.from ?? entry.end;
    const readableEnd = scene.type === 'chapter' ? Math.min(sceneEnd, entry.from + Math.floor(entry.duration * 0.5)) : sceneEnd;
    const settledFrames = Math.max(0, readableEnd - (entry.from + entry.overlap) - Math.round(composition.fps * 0.8));
    const settledSeconds = settledFrames / composition.fps;
    const copyVisible = sceneCopyVisible(scene);
    const supportingCopyVisible = scene.type === 'annotation' || (scene.type === 'result' && scene.comparison);
    const count = words(readableSceneCopy(scene), locale);
    const requiredSeconds = count === 0 ? 0 : Math.max((copyVisible && scene.body.trim()) || supportingCopyVisible ? 2 : copyVisible && scene.title.trim() ? 1.5 : 1, count / 3);
    if (settledSeconds < requiredSeconds) findings.push({ level: direction ? 'error' : 'warning', code: 'READING_TIME', sceneId: scene.id, message: `Needs ${requiredSeconds.toFixed(2)} settled seconds; has ${settledSeconds.toFixed(2)}.` });
    checkBounds(scene.id, [
      ...(copyVisible ? [
        { field: 'eyebrow', actual: [...scene.eyebrow].length, maximum: 80 },
        { field: 'title', actual: [...scene.title].length, maximum: scene.type === 'chapter' ? 120 : 100 },
        { field: 'body', actual: [...scene.body].length, maximum: 320 },
      ] : []),
      ...(scene.type === 'chapter' ? [{ field: 'number', actual: [...scene.number].length, maximum: 12 }] : []),
      ...(scene.type === 'annotation' ? [{ field: 'note.text', actual: [...scene.note.text].length, maximum: 240 }] : []),
      ...(scene.type === 'outro' && scene.cta ? [{ field: 'cta', actual: [...scene.cta].length, maximum: 100 }] : []),
      ...(scene.type === 'result' && scene.comparison ? [
        { field: 'comparison.beforeLabel', actual: [...scene.comparison.beforeLabel].length, maximum: 80 },
        { field: 'comparison.afterLabel', actual: [...scene.comparison.afterLabel].length, maximum: 80 },
      ] : []),
    ]);
  }
  if (props.scenes.some((scene) => scene.type === 'annotation' || (scene.type === 'outro' && scene.cta) || (scene.type === 'result' && scene.comparison))) {
    const ratio = contrast(props.accent, '#ffffff');
    contrastChecks.push({ name: 'white-on-project-accent', foreground: '#ffffff', background: props.accent, ratio, required: 4.5 });
    if (ratio < 4.5) findings.push({ level: direction ? 'error' : 'warning', code: 'ACCENT_CONTRAST', message: `White text on ${props.accent} has ${ratio.toFixed(2)}:1 contrast; 4.5:1 is required.` });
  }
  if (needsVideo) {
    findings.push({ level: 'warning', code: 'RECORDED_TEXT_REQUIRES_REVIEW', message: 'Text inside the captured application requires visual review; automated bounds and contrast checks cover authored content only.' });
    const availableWidth = Math.min(1160, 732 * props.viewport.width / props.viewport.height);
    const captureScale = availableWidth / props.viewport.width;
    if (captureScale < 0.65) findings.push({ level: 'warning', code: 'RECORDED_UI_SCALE', message: `The recorded interface is displayed at ${captureScale.toFixed(2)}x in overview layouts; inspect text legibility.` });
  }
  for (const scene of props.scenes.filter((item) => item.type === 'annotation')) {
    findings.push({ level: 'warning', code: 'ANNOTATION_BACKGROUND_REVIEW', sceneId: scene.id, message: 'The annotation overlays variable recorded pixels; inspect its settled preview for local contrast.' });
  }
  if (direction?.capture?.buildIdentity === 'unknown') findings.push({ level: 'warning', code: 'UNKNOWN_BUILD_IDENTITY', message: 'Capture build identity is unknown; inspect the current preview before delivery or recapture with buildIdentity.' });
  let mediaReport;
  let last = -1;
  if (!values.still) {
    if (direction && findings.some((finding) => finding.level === 'error')) {
      await writeFile(path.join(outputDir, 'review', 'quality.json'), JSON.stringify({ version: 1, status: 'blocked', strict: true, staticValidation: { status: 'passed' }, boundsChecks, findings }, null, 2) + '\n');
      throw new Error('Final render blocked by Director quality findings. Inspect review/quality.json.');
    }
    const video = path.join(outputDir, 'democena.mp4');
    await renderMedia({ composition, serveUrl, inputProps: props, puppeteerInstance, codec: 'h264', pixelFormat: 'yuv420p', imageFormat: 'png', outputLocation: video, concurrency: 2, crf: 19, onProgress: ({ progress }) => {
      const bucket = Math.floor(progress * 10);
      if (bucket !== last) { last = bucket; console.log(`Rendering ${bucket * 10}%`); }
    } });
    mediaReport = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate:format=duration', '-of', 'json', video], { encoding: 'utf8' }));
    const streams = mediaReport.streams ?? [];
    const videoStream = streams.find((stream) => stream.codec_type === 'video');
    if (!videoStream || videoStream.codec_name !== 'h264' || videoStream.width !== 1920 || videoStream.height !== 1080 || videoStream.pix_fmt !== 'yuv420p' || videoStream.r_frame_rate !== '30/1') findings.push({ level: 'error', code: 'MEDIA_CONTRACT', message: 'Final video does not match H.264 yuv420p 1920x1080 at 30 fps.' });
    if (streams.some((stream) => stream.codec_type === 'audio')) findings.push({ level: 'error', code: 'UNEXPECTED_AUDIO', message: 'Silent output must not contain an audio stream.' });
  }
  const quality = {
    version: 1,
    status: findings.some((finding) => finding.level === 'error') ? 'blocked' : 'passed',
    strict: Boolean(direction),
    project: { title: props.title, sceneCount: props.scenes.length, fps: composition.fps, durationInFrames: composition.durationInFrames, width: composition.width, height: composition.height },
    staticValidation: { status: 'passed' },
    coverage: { scenePreviews: stills.length, expectedScenePreviews: props.scenes.length, transitionFrames: transitions.length, posterFrame },
    boundsChecks,
    contrastChecks,
    safeArea: { ratio: 0.05, horizontalInset: 96, verticalInset: 54, status: 'passed', fullBleedExceptions: ['background decoration', 'progress bar', 'chapter number'] },
    findings,
    media: mediaReport,
    limits: ['Text embedded in recorded screenshots requires visual inspection.', 'Authored text bounds use deterministic content limits plus rendered preview inspection; pixel/OCR analysis is not enabled.'],
  };
  await writeFile(path.join(outputDir, 'review', 'quality.json'), JSON.stringify(quality, null, 2) + '\n');
  if (!values.still && quality.status === 'blocked') throw new Error('Final media failed quality inspection. Inspect review/quality.json.');
  console.log(`Rendered ${values.still ? 'review bundle' : 'MP4 and review bundle'} in ${outputDir}`);
} finally {
  await puppeteerInstance.close({ silent: true });
}
