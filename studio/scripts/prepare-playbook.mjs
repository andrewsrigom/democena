import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { applicationHtml, assertFixture } from '../../scripts/benchmark-fixture.mjs';

const studioRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const repoRoot = path.resolve(studioRoot, '..');
const captureDir = path.join(studioRoot, 'public', 'captures');
const scriptFile = fileURLToPath(import.meta.url);
const fixtureModule = path.join(repoRoot, 'scripts', 'benchmark-fixture.mjs');

function registryHtml() {
  return `<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1280px;height:800px;overflow:hidden;background:#edf2fb;color:#101b33;font-family:Arial,sans-serif}
    aside{position:absolute;inset:0 auto 0 0;width:220px;padding:38px 28px;background:#101b33;color:#fff}.brand{font-size:23px;font-weight:800}.brand i{display:inline-block;width:13px;height:13px;margin-right:10px;border-radius:4px;background:#215acb;transform:rotate(-9deg)}
    nav{display:grid;gap:10px;margin-top:62px}nav span{padding:13px 16px;border-radius:10px;color:#9caccc;font-size:14px}nav span:first-child{background:#215acb;color:#fff}
    main{margin-left:220px;padding:48px 54px}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;color:#215acb}.title{font-size:40px;line-height:1.05;letter-spacing:-.04em;margin:14px 0 10px}.sub{color:#65728a;font-size:16px}
    .metrics{display:flex;gap:15px;margin-top:36px}.metric{width:170px;padding:18px;border:1px solid #cfdaec;border-radius:16px;background:#fff;box-shadow:0 18px 45px #1e315410}.metric span{display:block;color:#75829a;font-size:10px;letter-spacing:.1em}.metric b{display:block;margin-top:10px;font-size:27px}.metric em{display:block;height:3px;margin-top:16px;border-radius:4px;background:linear-gradient(90deg,#215acb 72%,#d8e1f0 72%)}
    .rows{width:540px;margin-top:18px;padding:8px 18px;border:1px solid #cfdaec;border-radius:16px;background:#fff}.row{height:56px;display:flex;align-items:center;border-bottom:1px solid #e2e8f3;font-size:13px}.row:last-child{border:0}.row b{margin-left:auto;color:#215acb;font-size:10px;letter-spacing:.08em}
    .proof{position:absolute;left:820px;top:220px;width:320px;height:180px;padding:25px;border:1px solid #bfd0eb;border-radius:20px;background:#fff;box-shadow:0 26px 70px #17345f20}.proof small{color:#77849b;font-weight:800;letter-spacing:.12em}.proof h2{margin:26px 0 8px;font-size:27px}.proof p{margin:0;color:#65728a;font-size:13px}.bar{height:6px;margin-top:24px;border-radius:8px;background:linear-gradient(90deg,#215acb 86%,#dce4f1 86%)}
  </style><aside><div class="brand"><i></i>Fixture</div><nav><span>Overview</span><span>Sources</span><span>Checks</span><span>Publish</span></nav></aside><main><div class="eyebrow">MOTION REGISTRY</div><h1 class="title">Every motion choice.<br>One inspectable system.</h1><p class="sub">A deterministic product surface for local recipe and transition previews.</p><div class="metrics"><div class="metric"><span>RECIPES</span><b>05</b><em></em></div><div class="metric"><span>TRANSITIONS</span><b>07</b><em></em></div><div class="metric"><span>FALLBACKS</span><b>100%</b><em></em></div></div><div class="rows"><div class="row">Text motion <b>READY</b></div><div class="row">Product focus <b>VERIFIED</b></div><div class="row">Transition catalog <b>READY</b></div></div><section class="proof"><small>STATUS</small><h2>Registry ready</h2><p>Implementation, fixture, and fallback are linked.</p><div class="bar"></div></section></main>`;
}

async function isCurrent(job) {
  try {
    const output = await stat(job.video);
    const inputs = await Promise.all(job.sources.map((file) => stat(file)));
    return inputs.every((input) => input.mtimeMs <= output.mtimeMs);
  } catch {
    return false;
  }
}

const registryProject = path.join(repoRoot, 'examples', 'motion-registry', 'project.json');
const jobs = [{ id: 'motion-registry', html: registryHtml(), duration: 10, sources: [scriptFile, registryProject] }];
for (const id of ['forma', 'catalogforge', 'northstar', 'relay']) {
  const root = path.join(repoRoot, 'examples', 'benchmarks', id);
  const fixtureFile = path.join(root, 'fixture.json');
  const projectFile = path.join(root, 'project.json');
  const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
  const project = JSON.parse(await readFile(projectFile, 'utf8'));
  assertFixture(fixture, project, id);
  jobs.push({ id, html: applicationHtml(fixture), duration: 1, sources: [scriptFile, fixtureModule, fixtureFile, projectFile] });
}
for (const job of jobs) {
  job.screenshot = path.join(captureDir, `${job.id}.png`);
  job.video = path.join(captureDir, `${job.id}.mp4`);
}

const stale = [];
for (const job of jobs) if (!await isCurrent(job)) stale.push(job);
if (stale.length > 0) {
  await mkdir(captureDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    for (const job of stale) {
      await page.setContent(job.html, { waitUntil: 'load' });
      await page.screenshot({ path: job.screenshot, type: 'png' });
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', job.screenshot, '-t', String(job.duration), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', job.video], { stdio: 'inherit' });
    }
  } finally {
    await browser.close();
  }
}

for (const job of jobs) await access(job.video);
console.log(`Playbook fixtures ready: ${jobs.map((job) => path.basename(job.video)).join(', ')}`);
