import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { applicationHtml, assertFixture, escapeHtml, requiredRoles } from './benchmark-fixture.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const fixturesRoot = path.join(repoRoot, 'examples', 'benchmarks');
const rubric = [
  'storyClarity', 'hookStrength', 'productLegibility', 'evidenceIntegrity', 'focalClarity',
  'compositionQuality', 'compositionVariety', 'typographyHierarchy', 'brandFidelity',
  'depthAndFinish', 'motionCoherence', 'transitionContinuity', 'rhythmAndSettledHolds',
  'closingStrength', 'formatSafety',
];

const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    fixture: { type: 'string' },
    'validate-only': { type: 'boolean', default: false },
  },
});

function reviewTemplate(commit, ids) {
  return {
    rubricVersion: 1,
    reviewedCommit: commit,
    status: 'pending-review',
    scale: '0-5',
    hardGates: { evidenceIntegrity: 5, productLegibility: 4, brandFidelity: 4, motionCoherence: 4, minimumCategory: 3, minimumAverage: 4 },
    fixtures: Object.fromEntries(ids.map((id) => [id, {
      frames: [`${id}/review/contact-sheet.jpg`, `${id}/review/transitions/`],
      scores: Object.fromEntries(rubric.map((name) => [name, null])),
      reasons: [],
      blockers: [],
    }])),
    comparisonToPriorBaseline: 'Initial baseline; no prior benchmark bundle exists.',
  };
}

async function optionalAccess(file) {
  try { await access(file); return true; } catch { return false; }
}

const directories = (await readdir(fixturesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => !values.fixture || name === values.fixture)
  .sort();
if (directories.length === 0) throw new Error(values.fixture ? `Unknown benchmark fixture: ${values.fixture}` : 'No benchmark fixtures found');

const fixtures = [];
for (const directory of directories) {
  const root = path.join(fixturesRoot, directory);
  const fixture = JSON.parse(await readFile(path.join(root, 'fixture.json'), 'utf8'));
  const project = JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8'));
  assertFixture(fixture, project, directory);
  fixtures.push({ directory, root, fixture, project });
}

if (values['validate-only']) {
  console.log(JSON.stringify({ ok: true, fixtures: directories, requiredRoles }, null, 2));
  process.exit(0);
}

try {
  await access(path.join(repoRoot, 'studio', 'node_modules', 'remotion', 'package.json'));
} catch {
  throw new Error('Studio dependencies are required for visual benchmarks. Run npm run studio:install first.');
}

const workingTree = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim();
if (workingTree) throw new Error('Visual benchmark generation requires a clean Git working tree. Commit or stash changes, then run it again.');

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const outputRoot = path.resolve(values.output ?? path.join(repoRoot, 'output', 'benchmarks', commit));
const isWithin = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
if (isWithin(repoRoot, outputRoot) && !isWithin(path.join(repoRoot, 'output'), outputRoot)) {
  throw new Error('Benchmark output inside the repository must stay below the ignored output/ directory. Choose output/... or a directory outside the repository.');
}
await mkdir(outputRoot, { recursive: true });
const reviewFile = path.join(outputRoot, 'review.json');
const nextReview = reviewTemplate(commit, directories);
if (await optionalAccess(reviewFile)) {
  const previousReview = JSON.parse(await readFile(reviewFile, 'utf8'));
  const previousIds = Object.keys(previousReview.fixtures ?? {}).sort();
  const previousCommit = typeof previousReview.reviewedCommit === 'string' ? previousReview.reviewedCommit.slice(0, 12) : 'unknown';
  const fixtureSuffix = previousIds.length > 0 ? previousIds.join('-') : 'no-fixtures';
  const archiveBase = `review.${previousCommit}.${fixtureSuffix}`;
  let archiveFile = path.join(outputRoot, `${archiveBase}.json`);
  let archiveIndex = 2;
  while (await optionalAccess(archiveFile)) {
    archiveFile = path.join(outputRoot, `${archiveBase}.${archiveIndex}.json`);
    archiveIndex += 1;
  }
  await writeFile(archiveFile, JSON.stringify(previousReview, null, 2) + '\n');
}
await writeFile(reviewFile, JSON.stringify(nextReview, null, 2) + '\n');
const browser = await chromium.launch({ headless: true });
const index = { version: 1, commit, fixtures: [] };

try {
  for (const entry of fixtures) {
    const fixtureOutput = path.join(outputRoot, entry.directory);
    const generated = path.join(fixtureOutput, '_generated');
    const publicDir = path.join(generated, 'public');
    const captureDir = path.join(publicDir, 'captures');
    await mkdir(captureDir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await page.setContent(applicationHtml(entry.fixture), { waitUntil: 'load' });
    const screen = path.join(generated, 'application.png');
    await page.screenshot({ path: screen, type: 'png' });
    await page.close();

    const capture = path.join(captureDir, `${entry.directory}.mp4`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', screen, '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', capture], { stdio: 'inherit' });
    execFileSync(process.execPath, [path.join(repoRoot, 'studio', 'scripts', 'render.mjs'), '--project', path.join(entry.root, 'project.json'), '--public-dir', publicDir, '--output', fixtureOutput, '--still'], { cwd: repoRoot, stdio: 'inherit' });
    const storyboard = JSON.parse(await readFile(path.join(fixtureOutput, 'storyboard.json'), 'utf8'));
    const quality = JSON.parse(await readFile(path.join(fixtureOutput, 'review', 'quality.json'), 'utf8'));
    index.fixtures.push({
      id: entry.directory,
      roles: Object.fromEntries(storyboard.scenes.map((scene) => [scene.id, path.relative(outputRoot, scene.output).replaceAll('\\', '/')])),
      transitions: storyboard.transitions.length,
      qualityStatus: quality.status,
      contactSheet: `${entry.directory}/review/contact-sheet.jpg`,
    });
  }
} finally {
  await browser.close();
}

await writeFile(path.join(outputRoot, 'benchmark-index.json'), JSON.stringify(index, null, 2) + '\n');
const cards = index.fixtures.map((entry) => `<article><img src="${entry.contactSheet}"><h2>${escapeHtml(entry.id)}</h2><p>${entry.transitions} transition frames · ${escapeHtml(entry.qualityStatus)}</p></article>`).join('');
await writeFile(path.join(outputRoot, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Democena benchmark ${commit.slice(0, 8)}</title><style>*{box-sizing:border-box}body{margin:0;padding:36px;background:#0b1020;color:#edf3ff;font-family:Arial,sans-serif}h1{margin:0 0 28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}article{background:#141c31;border:1px solid #34415e;border-radius:16px;overflow:hidden}img{display:block;width:100%}h2{margin:18px 20px 8px;text-transform:capitalize}p{margin:0 20px 20px;color:#a9b6cd}</style><h1>Democena visual baseline · ${commit.slice(0, 8)}</h1><div class="grid">${cards}</div>`);
console.log(`Visual benchmark bundle: ${outputRoot}`);
