import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { chromium } from 'playwright';
import { chromeMatrix, transitionMatrix, transitionPhases } from '../src/transition-matrix.mjs';
import { frameStats, psnr, regionMeanAbsoluteDifference, regionMeanLuma, regionPsnr } from '../src/transition-quality.mjs';

const { values } = parseArgs({ options: {
  project: { type: 'string', default: '../examples/motion-registry/project.json' },
  'public-dir': { type: 'string', default: 'public' },
  output: { type: 'string', default: 'output/transition-matrix' },
} });
const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const studioRoot = path.join(repoRoot, 'studio');
const publicDir = path.resolve(values['public-dir']);
const outputDir = path.resolve(values.output);
const sourceProject = JSON.parse(await readFile(path.resolve(values.project), 'utf8'));
const matrix = [...transitionMatrix(sourceProject), ...chromeMatrix(sourceProject)];
const sourceMedia = path.resolve(publicDir, sourceProject.video);
assert(sourceMedia.startsWith(publicDir + path.sep), 'matrix media must stay inside the public directory');
await access(sourceMedia);

function decodeRgba(file) {
  return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], {
    encoding: 'buffer', maxBuffer: 1920 * 1080 * 4 + 1024 * 1024,
  });
}

function displayNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 'inf';
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

await mkdir(outputDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(studioRoot, 'src/index.tsx'), publicDir });
const puppeteerInstance = await openBrowser('chrome', { browserExecutable: chromium.executablePath() });
const report = { version: 1, status: 'passed', thresholds: { settledPsnrDb: 42, destinationPsnrDb: 42, chromeLumaRange: 8, chromePresenceDelta: .5 }, entries: [], findings: [] };
try {
  for (const entry of matrix) {
    const entryDir = path.join(outputDir, entry.id);
    await mkdir(entryDir, { recursive: true });
    const composition = await selectComposition({ serveUrl, id: 'Democena', inputProps: entry.project, puppeteerInstance });
    assert.equal(composition.durationInFrames, entry.durationInFrames, `${entry.id}: matrix duration drifted from the production composition`);
    const files = {};
    for (const phase of [...transitionPhases, 'settledCheck']) {
      const file = path.join(entryDir, `${phase}.png`);
      await renderStill({ composition, serveUrl, inputProps: entry.project, puppeteerInstance, frame: entry.frames[phase], output: file });
      files[phase] = file;
    }
    const decoded = Object.fromEntries(Object.entries(files).map(([phase, file]) => [phase, decodeRgba(file)]));
    const stats = Object.fromEntries(transitionPhases.map((phase) => [phase, frameStats(decoded[phase])]));
    const chromeLuma = transitionPhases.map((phase) => regionMeanLuma(decoded[phase], { x: 72, y: 34, width: 1776, height: 116 }));
    const chromeLumaRange = Math.max(...chromeLuma) - Math.min(...chromeLuma);
    const settledPsnrDb = psnr(decoded.after, decoded.settledCheck);
    const destinationFile = path.join(entryDir, 'destination.png');
    const destinationComposition = await selectComposition({ serveUrl, id: 'Democena', inputProps: entry.destinationProject, puppeteerInstance });
    await renderStill({
      composition: destinationComposition,
      serveUrl,
      inputProps: entry.destinationProject,
      puppeteerInstance,
      frame: entry.destinationReferenceFrame,
      output: destinationFile,
    });
    // The bottom progress line depends on total composition duration, which changes when
    // overlap is removed from the destination reference. Compare the actual scene canvas.
    const destinationPsnrDb = regionPsnr(decoded.after, decodeRgba(destinationFile), { x: 0, y: 0, width: 1920, height: 1072 });
    let chromePresenceDelta;
    if (entry.expectedChrome) {
      // Remotion merges input props over the selected composition props, so an empty
      // object must explicitly replace branding; `undefined` would preserve it.
      const referenceProject = { ...entry.project, branding: {} };
      const referenceComposition = await selectComposition({ serveUrl, id: 'Democena', inputProps: referenceProject, puppeteerInstance });
      chromePresenceDelta = {};
      for (const phase of Object.keys(entry.expectedChrome)) {
        const referenceFile = path.join(entryDir, `reference-${phase}.png`);
        await renderStill({ composition: referenceComposition, serveUrl, inputProps: referenceProject, puppeteerInstance, frame: entry.frames[phase], output: referenceFile });
        chromePresenceDelta[phase] = regionMeanAbsoluteDifference(
          decoded[phase], decodeRgba(referenceFile), { x: 72, y: 34, width: 760, height: 116 },
        );
      }
    }
    const checks = {
      visibleContent: transitionPhases.every((phase) => !stats[phase].blank),
      opaqueCoverage: transitionPhases.every((phase) => stats[phase].alphaMinimum === 255),
      ...(entry.expectedChrome ? {
        chromeState: Object.entries(entry.expectedChrome).every(([phase, visible]) => visible
          ? chromePresenceDelta[phase] >= report.thresholds.chromePresenceDelta
          : chromePresenceDelta[phase] < report.thresholds.chromePresenceDelta),
      } : { stableChrome: chromeLumaRange <= report.thresholds.chromeLumaRange }),
      settledAfter: settledPsnrDb >= report.thresholds.settledPsnrDb,
      destinationReached: destinationPsnrDb >= report.thresholds.destinationPsnrDb,
    };
    for (const [name, passed] of Object.entries(checks)) if (!passed) report.findings.push({ transitionId: entry.id, check: name });
    report.entries.push({
      id: entry.id,
      kind: entry.kind,
      fromSceneId: entry.fromSceneId,
      toSceneId: entry.toSceneId,
      ...(entry.expectedChrome ? { expectedChrome: entry.expectedChrome } : {}),
      ...(entry.expectedBackdrop ? { expectedBackdrop: entry.expectedBackdrop } : {}),
      frames: entry.frames,
      images: Object.fromEntries(transitionPhases.map((phase) => [phase, `${entry.id}/${phase}.png`])),
      references: { destination: `${entry.id}/destination.png` },
      metrics: {
        stats,
        chromeLuma: chromeLuma.map((value) => Number(value.toFixed(3))),
        chromeLumaRange: Number(chromeLumaRange.toFixed(3)),
        ...(chromePresenceDelta ? { chromePresenceDelta: Object.fromEntries(Object.entries(chromePresenceDelta).map(([phase, value]) => [phase, Number(value.toFixed(3))])) } : {}),
        settledPsnrDb: displayNumber(settledPsnrDb),
        destinationPsnrDb: displayNumber(destinationPsnrDb),
      },
      checks,
    });
  }
} finally {
  await puppeteerInstance.close({ silent: true });
}
report.status = report.findings.length === 0 ? 'passed' : 'blocked';
await writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

const imageData = {};
for (const entry of report.entries) for (const phase of transitionPhases) {
  const file = path.join(outputDir, entry.images[phase]);
  imageData[`${entry.id}:${phase}`] = `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
}
const rows = report.entries.map((entry) => `<section><h2>${escapeHtml(entry.id)} <span>${escapeHtml(entry.fromSceneId)} → ${escapeHtml(entry.toSceneId)}</span></h2><div>${transitionPhases.map((phase) => `<figure><img src="${imageData[`${entry.id}:${phase}`]}"><figcaption>${phase} · frame ${entry.frames[phase]}</figcaption></figure>`).join('')}</div></section>`).join('');
const contactBrowser = await chromium.launch({ headless: true });
try {
  const page = await contactBrowser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
  const transitionCount = report.entries.filter((entry) => entry.kind === 'transition').length;
  const chromeCount = report.entries.filter((entry) => entry.kind === 'chrome').length;
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:38px;background:#080d19;color:#eef3ff;font-family:Arial,sans-serif}header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:28px}h1{margin:0;font-size:32px}header p{margin:0;color:#8ea1c3}section{margin:0 0 24px;padding:18px;border:1px solid #2b3958;border-radius:16px;background:#0e1729}h2{margin:0 0 14px;font-size:18px}h2 span{margin-left:10px;color:#8090ad;font-size:12px;font-weight:400}section>div{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0;overflow:hidden;border:1px solid #344464;border-radius:10px;background:#080d19}img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}figcaption{padding:10px 12px;color:#9aabc8;font-size:11px;text-transform:uppercase}</style><header><h1>Transition matrix</h1><p>${transitionCount} transitions · ${chromeCount} chrome handoffs · before / midpoint / after · ${report.status}</p></header>${rows}`, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(outputDir, 'contact-sheet.jpg'), type: 'jpeg', quality: 88, fullPage: true });
} finally {
  await contactBrowser.close();
}

const options = report.entries.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.id)}</option>`).join('');
const matrixData = Object.fromEntries(report.entries.map((entry) => [entry.id, entry.images]));
await writeFile(path.join(outputDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Democena transition matrix</title><style>*{box-sizing:border-box}body{margin:0;padding:36px;background:#080d19;color:#edf3ff;font-family:Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:28px}h1{margin:0 0 8px}p{margin:0;color:#8fa0bd}.controls{display:flex;gap:10px;align-items:end}.controls label{display:grid;gap:6px;color:#8292ae;font-size:10px;text-transform:uppercase}select,button{height:38px;padding:0 12px;border:1px solid #344362;border-radius:9px;background:#111b30;color:#edf3ff}.phases{display:flex;gap:5px}.phases button.active{background:#315bd7}.compare{display:grid;grid-template-columns:1fr 1fr;gap:18px}.compare figure{margin:0;border:1px solid #30405f;border-radius:16px;overflow:hidden;background:#0e1729}.compare img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}.compare figcaption{padding:14px 16px;color:#9aa9c3}</style><header><div><h1>Motion A/B</h1><p>Compare any two transition or chrome-handoff cases at the same lifecycle phase.</p></div><div class="controls"><label>A<select id="a">${options}</select></label><label>B<select id="b">${options}</select></label><div class="phases">${transitionPhases.map((phase) => `<button data-phase="${phase}">${phase}</button>`).join('')}</div></div></header><div class="compare"><figure><img id="image-a"><figcaption id="caption-a"></figcaption></figure><figure><img id="image-b"><figcaption id="caption-b"></figcaption></figure></div><script>const matrix=${JSON.stringify(matrixData)};const a=document.querySelector('#a');const b=document.querySelector('#b');b.selectedIndex=1;let phase='midpoint';const update=()=>{for(const side of ['a','b']){const id=document.querySelector('#'+side).value;document.querySelector('#image-'+side).src=matrix[id][phase];document.querySelector('#caption-'+side).textContent=id+' · '+phase}document.querySelectorAll('[data-phase]').forEach(button=>button.classList.toggle('active',button.dataset.phase===phase))};document.querySelectorAll('select').forEach(select=>select.addEventListener('change',update));document.querySelectorAll('[data-phase]').forEach(button=>button.addEventListener('click',()=>{phase=button.dataset.phase;update()}));update();</script>`);
console.log(`Transition matrix: ${outputDir}`);
if (report.status !== 'passed') throw new Error(`Transition matrix failed ${report.findings.length} consistency checks. Inspect report.json.`);
