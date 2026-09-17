import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AgentService } from '../src/service.js';
import { Workspace } from '../src/storage.js';
import { capturePlanSchema } from '../src/capture-contracts.js';
import { capabilities, validate } from '../src/contracts.js';
import { captureFingerprint, compileDirection, digest, directionSchema } from '../src/direction.js';
import { example } from '../../studio/src/model.js';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'democena-agent-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  return new AgentService(await Workspace.open(root));
}
test('all eight discoverable examples pass the shared Studio validator', () => {
  assert.equal(example.branding, undefined);
  const discovered = capabilities();
  const scenes = discovered.examples.map((s, i) => ({ ...s, id: `scene-${i}` }));
  assert.equal(scenes.length, 8);
  assert.deepEqual(discovered.motionRecipes.map(recipe => recipe.id), ['standard-scene-motion', 'text-blur-slide', 'chapter-demote-to-label', 'focus-scan-lock', 'outro-strip-away']);
  assert(discovered.motionRecipes.every(recipe => recipe.useWhen.length > 0 && recipe.avoidWhen.length > 0));
  assert(discovered.motionRecipes.every(recipe => recipe.recommendedSeconds[0] < recipe.recommendedSeconds[1]));
  assert.deepEqual(discovered.transitions.presets.map(preset => preset.id), ['hard-cut', 'soft-crossfade', 'clean-slide', 'rise-cover', 'drop-cover']);
  assert(discovered.transitions.implementations.every(transition => transition.implementation && transition.fixture && transition.fallback));
  assert.deepEqual(discovered.motionLanguages, ['editorial', 'precise', 'kinetic', 'cinematic', 'quiet']);
  assert.deepEqual(discovered.compositions.layouts.map(layout => layout.id), ['framed', 'full-bleed', 'product-stage', 'detail-crop', 'layered-product', 'full-bleed-proof']);
  assert.deepEqual(discovered.compositions.typographicRoles, ['hero', 'statement', 'metadata', 'proof', 'label', 'silent-product']);
  assert(discovered.compositions.layouts.every(layout => layout.layers.background && layout.layers.midground && layout.layers.foreground));
  assert.equal(discovered.storyModes.launch.renderable, true);
  assert.equal(discovered.storyModes.spotlight.renderable, false);
  assert.deepEqual((discovered.directionSchema as { properties?: { version?: { const?: number } } }).properties?.version?.const, 2);
  assert.equal(validate({ version: 2, title: 'Demo', accent: '#215acb', video: 'captures/demo.webm', sourceDuration: 10, trimBefore: 0, viewport: { width: 1280, height: 800 }, scenes }).scenes.length, 8);
});
test('create, read, save and list preserve revisions and reject stale writes', async t => {
  const s = await fixture(t);
  const created = await s.store.create('demo', 'First', '#215acb');
  assert.equal(created.project.branding, undefined);
  await assert.rejects(s.store.create('demo', 'Other', '#215acb'), { code: 'ALREADY_EXISTS' });
  const changed = { ...created.project, title: 'Edited' };
  const saved = await s.store.save('demo', created.revision, changed);
  assert.notEqual(saved.revision, created.revision);
  await assert.rejects(s.store.save('demo', created.revision, { ...changed, title: 'Lost update' }), { code: 'REVISION_CONFLICT' });
  assert.equal((await s.store.get('demo')).project.title, 'Edited');
  const history = await readFile(path.join(s.store.root, 'projects/demo/revisions', `${created.revision}.json`), 'utf8');
  assert.equal(JSON.parse(history).title, 'First');
  assert.equal((await s.store.list()).projects.length, 1);
});
test('project appearance can be created and edited through the shared contract', async t => {
  const s = await fixture(t);
  const created = await s.store.create('dark-demo', 'Dark product', '#77a6ff', undefined, { surfaceMode: 'dark', background: '#101828', radius: 22 });
  assert.deepEqual(created.project.appearance, { surfaceMode: 'dark', background: '#101828', radius: 22 });
  assert.equal(created.timeline[0]?.motionRecipe, 'text-blur-slide');
  const saved = await s.store.save('dark-demo', created.revision, { ...created.project, appearance: { ...created.project.appearance, fontFamily: 'Inter, sans-serif' } });
  assert.equal(saved.project.appearance?.fontFamily, 'Inter, sans-serif');
});
test('concurrent writers cannot silently replace each other', async t => {
  const s = await fixture(t);
  const p = await s.store.create('demo', 'First', '#215acb');
  const results = await Promise.allSettled(['A','B'].map(title => s.store.save('demo', p.revision, { ...p.project, title })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});
test('invalid scenes and unimported media do not modify the saved project', async t => {
  const s = await fixture(t);
  const p = await s.store.create('demo', 'First', '#215acb');
  await assert.rejects(s.store.save('demo', p.revision, { ...p.project, scenes: [{ ...p.project.scenes[0], type: 'focus', focus: { x: 0, y: 0, width: 10, height: 10 }, source: { from: 0 } }] }), { code: 'INVALID_PROJECT' });
  await assert.rejects(s.store.save('demo', p.revision, { ...p.project, video: 'captures/not-imported.webm' }), { code: 'MEDIA_CHANGE_REQUIRES_IMPORT' });
  assert.equal((await s.store.get('demo')).revision, p.revision);
});
test('source paths cannot escape the workspace or follow symlinks', async t => {
  const s = await fixture(t);
  await assert.rejects(s.store.safe('../outside.mp4'), { code: 'INVALID_PATH' });
  await assert.rejects(s.store.safe('/tmp/outside.mp4'), { code: 'INVALID_PATH' });
  try {
    await symlink(tmpdir(), path.join(s.store.root, 'assets/link'));
    await assert.rejects(s.store.safe('assets/link/outside.mp4'), { code: 'INVALID_PATH' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
  }
  await assert.rejects(s.call('get_project', { projectId: '../demo' }));
});
test('warnings distinguish valid timing from layout and reading concerns', async t => {
  const s = await fixture(t);
  const p = await s.store.create('demo', 'A very long title '.repeat(8), '#215acb');
  assert(p.warnings.some(w => w.code === 'READING_TIME'));
  assert(p.warnings.some(w => w.code === 'TEXT_LAYOUT'));
  assert.equal(p.durationInFrames, 150);
});
test('missing jobs and unfinished previews report actionable errors', async t => {
  const s = await fixture(t);
  await assert.rejects(s.getJob('unknown'), { code: 'NOT_FOUND' });
  await assert.rejects(s.call('read_preview', { jobId: '../outside' }));
});
test('recent jobs can be recovered and filtered by project', async t => {
  const s = await fixture(t);
  for (const job of [
    { jobId: 'old-job', projectId: 'alpha', revision: 'a'.repeat(64), mode: 'capture', status: 'failed', createdAt: '2026-01-01T00:00:00.000Z', error: 'Expected failure' },
    { jobId: 'new-job', projectId: 'beta', revision: 'b'.repeat(64), mode: 'preview', status: 'succeeded', createdAt: '2026-01-02T00:00:00.000Z', capture: { private: 'omitted' } },
  ]) {
    const dir = path.join(s.store.root, 'jobs', job.jobId);
    await mkdir(dir);
    await writeFile(path.join(dir, 'job.json'), JSON.stringify(job));
  }
  const all = await s.call('list_jobs', {});
  assert.deepEqual((all.jobs as any[]).map(job => job.jobId), ['new-job', 'old-job']);
  assert.equal('capture' in (all.jobs as any[])[0], false);
  const filtered = await s.call('list_jobs', { projectId: 'alpha', limit: 1 });
  assert.deepEqual((filtered.jobs as any[]).map(job => job.jobId), ['old-job']);
});
test('CLI emits one JSON result and a nonzero exit code for errors', async t => {
  const s = await fixture(t);
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const result = await promisify(execFile)(process.execPath, [cli, 'list_projects', '--workspace', s.store.root]);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, projects: [] });
  assert.equal(result.stderr, '');
  await assert.rejects(promisify(execFile)(process.execPath, [cli, 'unknown', '--workspace', s.store.root]), (e: any) => e.code === 1 && JSON.parse(e.stdout).ok === false);
});
test('real stdio MCP handshake, discovery, resources, edits and errors', async t => {
  const s = await fixture(t);
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/index.js', import.meta.url)), '--workspace', s.store.root], stderr: 'pipe' });
  const client = new Client({ name: 'democena-test', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 20);
  assert.equal((await client.listResources()).resources.length, 3);
  assert((await client.readResource({ uri: 'democena://guide' })).contents.length > 0);
  const motionResource = await client.readResource({ uri: 'democena://motion' });
  const motionCatalog = JSON.parse(String((motionResource.contents[0] as { text?: string }).text));
  assert.equal(motionCatalog.version, 1);
  assert.deepEqual(motionCatalog.recipes.map((recipe: { id: string }) => recipe.id), capabilities().motionRecipes.map((recipe) => recipe.id));
  assert.deepEqual(motionCatalog.transitions, capabilities().transitions);
  const created = await client.callTool({ name: 'democena_create_project', arguments: { projectId: 'via-mcp', title: 'Agent demo' } });
  assert.equal(created.isError, undefined);
  const data = created.structuredContent as any;
  assert.equal(data.project.title, 'Agent demo');
  const saved = await client.callTool({ name: 'democena_save_project', arguments: { projectId: 'via-mcp', expectedRevision: data.revision, project: { ...data.project, title: 'Edited via MCP' } } });
  assert.equal((saved.structuredContent as any).project.title, 'Edited via MCP');
  const conflict = await client.callTool({ name: 'democena_save_project', arguments: { projectId: 'via-mcp', expectedRevision: data.revision, project: data.project } });
  assert.equal(conflict.isError, true);
  assert.equal((conflict.structuredContent as any).error.code, 'REVISION_CONFLICT');
  const invalid = await client.callTool({ name: 'democena_create_project', arguments: { projectId: '../escape', title: 'Invalid' } });
  assert.equal(invalid.isError, true);
});
test('malformed recordings are rejected without changing project or keeping copied files', async t => {
  const s = await fixture(t);
  const p = await s.store.create('demo', 'First', '#215acb');
  await writeFile(path.join(s.store.root, 'assets/broken.mp4'), 'not a recording');
  await assert.rejects(s.importMedia('demo', p.revision, 'assets/broken.mp4'), { code: 'MEDIA_PROBE_FAILED' });
  assert.equal((await s.store.get('demo')).revision, p.revision);
  assert.deepEqual(await readdir(path.join(s.store.root, 'projects/demo/public/captures')), []);
});
test('branding text is editable while logos require a validated import', async t => {
  const s = await fixture(t);
  const p = await s.store.create('demo', 'Catalog story', '#215acb', { name: 'CatalogForge', tagline: 'CATALOGS, READY TO SHARE' });
  assert.equal(p.project.branding?.name, 'CatalogForge');
  await assert.rejects(s.store.save('demo', p.revision, { ...p.project, branding: { ...p.project.branding, logo: 'branding/manual.png' } }), { code: 'BRAND_CHANGE_REQUIRES_IMPORT' });
  await writeFile(path.join(s.store.root, 'assets/logo.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nWQAAAAASUVORK5CYII=', 'base64'));
  const branded = await s.importBrandLogo('demo', p.revision, 'assets/logo.png');
  assert.match(branded.project.branding?.logo ?? '', /^branding\/[a-f0-9-]+\.png$/);
  assert.equal((await readFile(path.join(s.store.root, 'projects/demo/public', branded.project.branding!.logo!))).subarray(1, 4).toString(), 'PNG');
  const hidden = await s.store.save('demo', branded.revision, { ...branded.project, branding: { name: 'CatalogForge' } });
  assert.equal(hidden.project.branding?.logo, undefined);
  await writeFile(path.join(s.store.root, 'assets/fake.png'), 'not an image');
  await assert.rejects(s.importBrandLogo('demo', hidden.revision, 'assets/fake.png'), { code: 'INVALID_BRAND_ASSET' });
});

test('invalid creation leaves no broken project and queued previews report not ready', async t => {
  const s = await fixture(t);
  await assert.rejects(s.store.create('invalid', 'Title', 'invalid-color'), { code: 'INVALID_PROJECT' });
  assert.deepEqual((await s.store.list()).projects, []);
  const dir = path.join(s.store.root, 'jobs', 'queued-job');
  await mkdir(dir);
  await writeFile(path.join(dir, 'job.json'), JSON.stringify({ jobId: 'queued-job', status: 'queued', createdAt: new Date().toISOString() }));
  await assert.rejects(s.preview('queued-job'), { code: 'JOB_NOT_READY' });
});

test('capture plans require a verified outcome and explicit navigation origins', () => {
  const plan = { url: 'http://localhost:4173', steps: [{ id: 'result', action: 'expect', target: { testId: 'result' } }] };
  assert(capturePlanSchema.safeParse(plan).success);
  for (const change of [
    { url: 'not a URL' }, { allowedOrigins: ['not a URL'] }, { url: 'file:///etc/passwd' }, { url: 'https://user:password@example.com' },
    { steps: [{ id: 'wait', action: 'wait', durationMs: 100 }] },
    { steps: [...plan.steps, ...plan.steps] },
    { steps: [...plan.steps, { id: 'change', action: 'click', target: { testId: 'save' } }] },
    { steps: [...plan.steps, { id: 'away', action: 'goto', url: 'https://other.example' }] },
    { steps: [...plan.steps, { id: 'script', action: 'goto', url: 'javascript:alert(1)' }] },
    { redact: ['body { display:none }'] }, { timeoutMs: 180001 },
  ]) assert.equal(capturePlanSchema.safeParse({ ...plan, ...change }).success, false);
  assert(capturePlanSchema.safeParse({
    ...plan,
    allowedOrigins: ['https://other.example'],
    steps: [...plan.steps, { id: 'away', action: 'goto', url: 'https://other.example/path' }, { id: 'arrived', action: 'expect', target: { testId: 'result' } }],
  }).success);
});
test('capture adoption rejects unfinished jobs and wrong projects without modifying edits', async t => {
  const s = await fixture(t);
  const project = await s.store.create('demo', 'Retain me', '#215acb');
  const dir = path.join(s.store.root, 'jobs/capture-job');
  await mkdir(dir);
  await writeFile(path.join(dir, 'job.json'), JSON.stringify({ jobId: 'capture-job', projectId: 'demo', mode: 'capture', status: 'failed' }));
  await assert.rejects(s.useCapture('demo', project.revision, 'capture-job'), { code: 'CAPTURE_NOT_READY' });
  await writeFile(path.join(dir, 'job.json'), JSON.stringify({ jobId: 'capture-job', projectId: 'other', mode: 'capture', status: 'succeeded', capture: {}, artifacts: { recording: '/tmp/unused.webm' } }));
  await assert.rejects(s.useCapture('demo', project.revision, 'capture-job'), { code: 'WRONG_PROJECT' });
  assert.equal((await s.store.get('demo')).revision, project.revision);
  await writeFile(path.join(dir, 'capture-plan.json'), JSON.stringify({ url: 'http://localhost:4173', steps: [{ id: 'result', action: 'expect', target: { testId: 'result' } }] }));
  (s as unknown as { importMedia: (...args: unknown[]) => Promise<{ reused: boolean }> }).importMedia = async () => ({ reused: true });
  assert.equal((await s.useCapture('demo', project.revision, 'capture-job', true) as unknown as { reused: boolean }).reused, true);
});

function launchDirection() {
  const capture = {
    recordingDigest: 'a'.repeat(64),
    planDigest: 'b'.repeat(64),
    viewport: { width: 1280, height: 800 },
    devicePixelRatio: 1,
    initialRoute: 'http://localhost:4173',
    buildIdentity: 'fixture-1',
    events: [
      { markId: 'reveal', timestamp: 0, settledUntil: 0.25, verified: false },
      { markId: 'comparison-before', timestamp: 1, settledUntil: 1.25, rect: { x: 100, y: 100, width: 300, height: 120 }, rectTimestamp: 1, verified: false },
      { markId: 'camera-start', timestamp: 1, settledUntil: 1.25, rect: { x: 50, y: 50, width: 100, height: 50 }, rectTimestamp: 1, verified: false },
      { markId: 'camera-stop', timestamp: 2, settledUntil: 2.25, rect: { x: 300, y: 200, width: 120, height: 60 }, rectTimestamp: 2, verified: false },
      { markId: 'result', timestamp: 4, settledUntil: 4.25, rect: { x: 100, y: 100, width: 300, height: 120 }, rectTimestamp: 4, verified: true },
    ],
  };
  const authored = (claim: string) => [{ kind: 'authored-copy' as const, claim }];
  const captured = (timestamp: number, verified = false) => [{ kind: 'capture' as const, timestamp, markId: verified ? 'result' : 'reveal', verified }];
  return {
    version: 1 as const,
    status: 'reviewed' as const,
    executionMode: 'autonomous' as const,
    profile: 'launch' as const,
    tone: 'polished' as const,
    format: 'landscape-1080p' as const,
    locale: 'en',
    audience: 'Catalog teams',
    primaryMessage: 'Publish a useful catalog quickly.',
    visualDirection: 'Use concise copy and restrained motion.',
    brandSource: 'project' as const,
    facts: ['The captured result is published.'],
    exclusions: [],
    privacy: ['Use synthetic records.'],
    reviewedBy: 'director' as const,
    reviewedAt: '2026-09-16T12:00:00.000Z',
    captureFingerprint: captureFingerprint(capture),
    capture,
    poster: { sceneId: 'result', sceneLocalTime: 2 },
    scenes: [
      { narrativeRole: 'hook' as const, reason: 'State the value.', expectedSettledAt: 2, evidence: authored('A concise product promise.'), scene: { id: 'hook', type: 'text' as const, duration: 4.1, eyebrow: 'Catalog work', title: 'Ready sooner.', body: 'Turn a product list into a useful catalog.' } },
      { narrativeRole: 'product-reveal' as const, reason: 'Show the real product.', transitionPreset: 'rise-cover' as const, expectedSettledAt: 2, evidence: captured(0), scene: { id: 'reveal', type: 'overview' as const, duration: 4.1, eyebrow: 'The workspace', title: 'One clear flow.', body: 'Work from the captured application.', source: { from: 0, freeze: true }, presentation: { layout: 'full-bleed' as const, caption: 'bottom-right' as const } } },
      { narrativeRole: 'verified-result' as const, reason: 'Prove the result.', expectedSettledAt: 2, evidence: captured(4, true), scene: { id: 'result', type: 'result' as const, duration: 4.1, eyebrow: 'Published', title: 'The result is visible.', body: 'The assertion and captured frame agree.', source: { from: 4, freeze: true } } },
      { narrativeRole: 'closing' as const, reason: 'Close on the benefit.', transitionPreset: 'drop-cover' as const, expectedSettledAt: 2, evidence: authored('Restate the approved benefit.'), scene: { id: 'closing', type: 'outro' as const, duration: 4.1, eyebrow: 'CatalogForge', title: 'Ready to share.', body: 'A clear catalog with a clear next step.' } },
    ],
  };
}

async function recordedTour(s: AgentService, id: string, title: string) {
  const created = await s.store.create(id, title, '#215acb');
  const launch = launchDirection();
  const direction = {
    ...launch,
    profile: 'tour' as const,
    poster: { sceneId: 'result', sceneLocalTime: 2 },
    scenes: [launch.scenes[1], launch.scenes[2]],
  };
  const recorded = validate({
    ...created.project,
    video: 'captures/demo.webm',
    sourceDuration: 20,
    viewport: { width: 1280, height: 800 },
  });
  await s.store.commit(id, created.revision, created.project, recorded);
  await mkdir(path.join(s.store.root, `projects/${id}/public/captures`), { recursive: true });
  await writeFile(path.join(s.store.root, `projects/${id}/public/captures/demo.webm.json`), JSON.stringify({
    ...direction.capture,
    captureFingerprint: direction.captureFingerprint,
  }));
  return { project: await s.store.get(id), direction };
}

test('launch compilation enforces shape, evidence and a 15-25 second runtime', () => {
  const direction = launchDirection();
  const project = validate({ version: 2, title: 'CatalogForge', accent: '#402c8f', video: 'captures/demo.webm', sourceDuration: 20, trimBefore: 0, viewport: { width: 1280, height: 800 }, scenes: [direction.scenes[0].scene] });
  const compiled = compileDirection(direction, project);
  assert.equal(compiled.project.scenes.length, 4);
  assert.equal(compiled.project.scenes[1]?.transition?.type, 'slide-up');
  assert.equal(compiled.project.scenes[3]?.transition?.type, 'slide-down');
  assert.deepEqual('presentation' in compiled.project.scenes[1]! ? compiled.project.scenes[1].presentation : undefined, { layout: 'full-bleed', caption: 'bottom-right' });
  assert(compiled.duration >= 15 && compiled.duration <= 25);
  assert.throws(() => compileDirection({ ...direction, executionMode: 'plan-only' }, project), /Plan-only directions cannot compile/);
  assert.throws(() => compileDirection({ ...direction, profile: 'tour', poster: { sceneId: 'hook', sceneLocalTime: 2 }, scenes: [direction.scenes[0]] }, project), /real product moment/);
  assert.throws(() => compileDirection({ ...direction, scenes: direction.scenes.map((entry) => entry.narrativeRole === 'verified-result' ? { ...entry, evidence: [{ kind: 'capture', timestamp: 4, markId: 'result', verified: false }] } : entry) }, project), /verified result/);
  assert.throws(() => compileDirection({ ...direction, scenes: direction.scenes.map((entry) => entry.narrativeRole === 'product-reveal' ? { ...entry, evidence: [{ kind: 'capture', timestamp: 0, verified: false }] } : entry) }, project), /requires a captured marker ID/);
  assert.throws(() => compileDirection({ ...direction, scenes: direction.scenes.map((entry) => entry.narrativeRole === 'verified-result' ? { ...entry, evidence: [{ kind: 'capture', timestamp: 4, markId: 'invented', verified: true }] } : entry) }, project), /outside the adopted take/);
  assert.throws(() => compileDirection({ ...direction, scenes: direction.scenes.map((entry) => entry.narrativeRole === 'verified-result' ? { ...entry, evidence: [{ kind: 'capture', timestamp: 5, markId: 'result', verified: true }] } : entry) }, project), /timestamp outside capture marker/);
  assert.throws(() => compileDirection({ ...direction, scenes: direction.scenes.map((entry) => entry.narrativeRole === 'verified-result' ? { ...entry, evidence: [{ kind: 'capture', timestamp: 3.9, markId: 'result', verified: true }] } : entry) }, project), /timestamp outside capture marker/);
  assert.throws(() => compileDirection({ ...direction, scenes: direction.scenes.map((entry) => entry.narrativeRole === 'verified-result' ? { ...entry, evidence: [{ kind: 'capture', timestamp: 4, markId: 'result', rect: { x: 0, y: 0, width: 10, height: 10 }, verified: true }] } : entry) }, project), /rectangle that does not match/);
  assert.throws(() => compileDirection({ ...direction, scenes: direction.scenes.map((entry) => entry.narrativeRole === 'verified-result' ? { ...entry, evidence: [
    { kind: 'capture', timestamp: 0, markId: 'reveal', verified: false },
    { kind: 'capture', timestamp: 4, markId: 'result', verified: true },
  ], scene: { ...entry.scene, source: { from: 0, freeze: true } } } : entry) }, project), /verified result displayed from its verified capture evidence/);
  assert.throws(() => compileDirection({ ...direction, scenes: direction.scenes.map((entry) => entry.narrativeRole === 'verified-result' ? { ...entry, scene: { id: 'result', type: 'text', duration: 4.1, eyebrow: 'Published', title: 'The result is visible.', body: 'Authored copy alone is not verified product evidence.' } } : entry) }, project), /requires authored-copy evidence/);
  const unverifiedCapture = { ...direction.capture, events: direction.capture.events.map((event) => event.markId === 'result' ? { ...event, verified: false } : event) };
  assert.throws(() => compileDirection({ ...direction, capture: unverifiedCapture, captureFingerprint: captureFingerprint(unverifiedCapture) }, project), /did not verify it/);
  const comparison = {
    ...direction,
    scenes: direction.scenes.map((entry) => entry.narrativeRole === 'verified-result' ? {
      ...entry,
      evidence: [
        { kind: 'capture' as const, timestamp: 1, markId: 'comparison-before', rect: { x: 100, y: 100, width: 300, height: 120 }, verified: false },
        { kind: 'capture' as const, timestamp: 4, markId: 'result', rect: { x: 100, y: 100, width: 300, height: 120 }, verified: true },
      ],
      scene: { ...entry.scene, source: { from: 9, freeze: true }, comparison: { before: 1, after: 4, crop: { x: 100, y: 100, width: 300, height: 120 }, beforeLabel: 'Before', afterLabel: 'After' } },
    } : entry),
  };
  assert.equal(compileDirection(comparison, project).project.scenes[2]?.type, 'result');
});

test('Direction v1 migrates in memory to creative Direction v2 without changing Project v2 output', () => {
  const legacy = launchDirection();
  const project = validate({ version: 2, title: 'CatalogForge', accent: '#402c8f', video: 'captures/demo.webm', sourceDuration: 20, trimBefore: 0, viewport: { width: 1280, height: 800 }, scenes: [legacy.scenes[0].scene] });
  const migrated = directionSchema.parse(legacy);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.storyMode, 'launch');
  assert.equal(migrated.motionLanguage, 'editorial');
  assert.equal(migrated.scenes[0]?.beat.typographicRole, 'hero');
  assert.equal(migrated.scenes[1]?.beat.primarySubject, 'product');
  assert.equal(migrated.scenes[2]?.beat.transitionIntent, 'prove');
  assert.deepEqual(compileDirection(legacy, project).project, compileDirection(migrated, project).project);
  const legacyRestrainedZoom = { ...legacy, scenes: legacy.scenes.map((entry, index) => index === 1 ? { ...entry, transitionPreset: 'restrained-zoom' as const } : entry) };
  const migratedRestrainedZoom = directionSchema.parse(legacyRestrainedZoom);
  assert.equal(migratedRestrainedZoom.scenes[1]?.transitionPreset, 'soft-crossfade');
  assert.equal(compileDirection(legacyRestrainedZoom, project).project.scenes[1]?.transition?.type, 'fade');
  assert.throws(() => directionSchema.parse({ ...migratedRestrainedZoom, scenes: migratedRestrainedZoom.scenes.map((entry, index) => index === 1 ? { ...entry, transitionPreset: 'restrained-zoom' } : entry) }), /Invalid option/);
  const legacyWithUnmatchedRecipeEvidence = { ...legacy, scenes: legacy.scenes.map((entry, index) => index === 0 ? { ...entry, evidence: [{ kind: 'capture' as const, timestamp: 0, markId: 'reveal', verified: false }] } : entry) };
  assert.equal(directionSchema.parse(legacyWithUnmatchedRecipeEvidence).scenes[0]?.beat.recipe.selected, 'text-blur-slide');
  assert.throws(() => compileDirection(legacyWithUnmatchedRecipeEvidence, project), /requires authored-copy evidence/);
});

test('Direction v2 rejects incompatible recipes and gates story modes that are not implemented', () => {
  const migrated = directionSchema.parse(launchDirection());
  const project = validate({ version: 2, title: 'CatalogForge', accent: '#402c8f', video: 'captures/demo.webm', sourceDuration: 20, trimBefore: 0, viewport: { width: 1280, height: 800 }, scenes: [migrated.scenes[0]!.scene] });
  const incompatible = {
    ...migrated,
    scenes: migrated.scenes.map((entry, index) => index === 0 ? {
      ...entry,
      beat: { ...entry.beat, recipe: { selected: 'focus-scan-lock', compatible: ['focus-scan-lock', 'standard-scene-motion'], fallback: 'standard-scene-motion' } },
    } : entry),
  };
  assert.throws(() => directionSchema.parse(incompatible), /does not support text scenes/);
  assert.throws(() => directionSchema.parse({ ...migrated, scenes: migrated.scenes.map((entry, index) => index === 0 ? { ...entry, beat: { ...entry.beat, recipe: { selected: 'unknown-recipe', compatible: ['unknown-recipe', 'standard-scene-motion'], fallback: 'standard-scene-motion' } } } : entry) }), /Unknown motion recipe/);
  assert.throws(() => directionSchema.parse({ ...migrated, scenes: migrated.scenes.map((entry, index) => index === 0 ? { ...entry, beat: { ...entry.beat, recipe: { compatible: ['standard-scene-motion'], fallback: 'standard-scene-motion' } } } : entry) }), /current Project v2 renderer applies text-blur-slide/);
  assert.throws(() => directionSchema.parse({ ...migrated, scenes: migrated.scenes.map((entry, index) => index === 0 ? { ...entry, beat: { ...entry.beat, recipe: { selected: 'standard-scene-motion', compatible: ['text-blur-slide', 'standard-scene-motion'], fallback: 'standard-scene-motion' } } } : entry) }), /cannot render through Project v2/);
  assert.throws(() => compileDirection({ ...migrated, storyMode: 'spotlight' }, project), /defined but is not renderable yet/);
});

test('Direction v2 persists per-beat typography, composition and chrome into Project v2', () => {
  const migrated = directionSchema.parse(launchDirection());
  const enhanced = {
    ...migrated,
    scenes: migrated.scenes.map((entry, index) => index === 1 ? {
      ...entry,
      beat: { ...entry.beat, typographicRole: 'metadata' as const, composition: { layout: 'product-stage' as const, caption: 'top-left' as const, chrome: 'hide' as const } },
      scene: { ...entry.scene, typographicRole: 'metadata' as const, chrome: 'hide' as const, presentation: { layout: 'product-stage' as const, caption: 'top-left' as const } },
    } : index === 2 ? {
      ...entry,
      evidence: entry.evidence.map(item => item.kind === 'capture' ? { ...item, rect: { x: 100, y: 100, width: 300, height: 120 } } : item),
      beat: { ...entry.beat, typographicRole: 'proof' as const, composition: { layout: 'full-bleed-proof' as const, caption: 'bottom-left' as const, chrome: 'show' as const } },
      scene: { ...entry.scene, focus: { x: 100, y: 100, width: 300, height: 120 }, typographicRole: 'proof' as const, chrome: 'show' as const, presentation: { layout: 'full-bleed-proof' as const, caption: 'bottom-left' as const } },
    } : entry),
  };
  const parsed = directionSchema.parse(enhanced);
  const project = validate({ version: 2, title: 'CatalogForge', accent: '#402c8f', video: 'captures/demo.webm', sourceDuration: 20, trimBefore: 0, viewport: { width: 1280, height: 800 }, scenes: [parsed.scenes[0]!.scene] });
  const compiled = compileDirection(parsed, project).project;
  assert.deepEqual(compiled.scenes[1], { ...parsed.scenes[1]!.scene, transition: { type: 'slide-up', duration: 0.4 } });
  assert.deepEqual(compiled.scenes[2], { ...parsed.scenes[2]!.scene, transition: { type: 'fade', duration: 0.3 } });
});

test('saving legacy Direction v1 writes v2 while preserving the exact archived revision', async t => {
  const s = await fixture(t);
  await s.store.create('direction-migration', 'Direction migration', '#215acb');
  const legacyRaw = JSON.stringify(launchDirection()) + '\r\n  ';
  const legacyRevision = createHash('sha256').update(legacyRaw).digest('hex');
  const directionFile = path.join(s.store.root, 'projects/direction-migration/direction/direction.json');
  await writeFile(directionFile, legacyRaw);
  const read = await s.store.getDirection('direction-migration');
  assert.equal(read.directionRevision, legacyRevision);
  assert.equal(read.direction.version, 2);
  await s.store.saveDirection('direction-migration', legacyRevision, read.direction);
  const saved = JSON.parse(await readFile(directionFile, 'utf8'));
  assert.equal(saved.version, 2);
  assert.equal(saved.storyMode, 'launch');
  assert.equal(saved.profile, undefined);
  const archived = await readFile(path.join(s.store.root, 'projects/direction-migration/direction/revisions', `${legacyRevision}.json`), 'utf8');
  assert.equal(createHash('sha256').update(archived).digest('hex'), legacyRevision);
});

test('workflow compilation preserves the exact legacy Direction v1 revision', async t => {
  const s = await fixture(t);
  const { project, direction } = await recordedTour(s, 'legacy-compile', 'Legacy compile');
  const legacyRaw = JSON.stringify(direction) + '\r\n  ';
  const legacyRevision = createHash('sha256').update(legacyRaw).digest('hex');
  const directionDir = path.join(s.store.root, 'projects/legacy-compile/direction');
  await mkdir(directionDir, { recursive: true });
  await writeFile(path.join(directionDir, 'direction.json'), legacyRaw);

  const compiled = await s.compileDirector('legacy-compile', legacyRevision, project.revision);
  assert.equal(compiled.direction.direction.version, 2);
  assert.equal(compiled.direction.direction.status, 'compiled');
  const archived = await readFile(path.join(directionDir, 'revisions', `${legacyRevision}.json`), 'utf8');
  assert.equal(createHash('sha256').update(archived).digest('hex'), legacyRevision);
  assert.equal(JSON.parse(archived).version, 1);
});

test('capture evidence follows the raw recording clock after project trimming', () => {
  const direction = launchDirection();
  const capture = {
    ...direction.capture,
    events: direction.capture.events.map((event) => ({ ...event, timestamp: event.timestamp + 1, settledUntil: event.settledUntil + 1 })),
  };
  const shifted = {
    ...direction,
    capture,
    captureFingerprint: captureFingerprint(capture),
    scenes: direction.scenes.map((entry) => ({
      ...entry,
      evidence: entry.evidence.map((item) => item.kind === 'capture' ? { ...item, timestamp: item.timestamp + 1 } : item),
    })),
  };
  const project = validate({ version: 2, title: 'CatalogForge', accent: '#402c8f', video: 'captures/demo.webm', sourceDuration: 21, trimBefore: 1, viewport: { width: 1280, height: 800 }, scenes: [shifted.scenes[0].scene] });
  assert.equal(compileDirection(shifted, project).project.scenes.length, 4);
});

test('camera stops require matching rectangle evidence at each displayed source time', () => {
  const direction = launchDirection();
  const start = { x: 50, y: 50, width: 100, height: 50 };
  const end = { x: 300, y: 200, width: 120, height: 60 };
  const cameraEntry = {
    ...direction.scenes[1],
    evidence: [
      { kind: 'capture' as const, timestamp: 1, markId: 'camera-start', rect: start, verified: false },
      { kind: 'capture' as const, timestamp: 2, markId: 'camera-stop', rect: end, verified: false },
    ],
    scene: {
      ...direction.scenes[1].scene,
      type: 'camera' as const,
      source: { from: 1, freeze: false },
      path: [{ at: 0, focus: start, zoom: 1.2 }, { at: 1, focus: end, zoom: 1.4 }],
    },
  };
  const cameraDirection = { ...direction, scenes: direction.scenes.map((entry, index) => index === 1 ? cameraEntry : entry) };
  const project = validate({ version: 2, title: 'CatalogForge', accent: '#402c8f', video: 'captures/demo.webm', sourceDuration: 20, trimBefore: 0, viewport: { width: 1280, height: 800 }, scenes: [direction.scenes[0].scene] });
  assert.equal(compileDirection(cameraDirection, project).project.scenes[1]?.type, 'camera');
  const mistimedCapture = { ...direction.capture, events: direction.capture.events.map((event) => event.markId === 'camera-start' ? { ...event, rectTimestamp: 0.8 } : event) };
  assert.throws(() => compileDirection({ ...cameraDirection, capture: mistimedCapture, captureFingerprint: captureFingerprint(mistimedCapture) }, project), /rectangle outside its measurement time/);
  const mistimed = {
    ...cameraDirection,
    scenes: cameraDirection.scenes.map((entry, index) => index === 1 ? { ...entry, scene: { ...entry.scene, path: [{ at: 0, focus: start, zoom: 1.2 }, { at: 1, focus: start, zoom: 1.4 }] } } : entry),
  };
  assert.throws(() => compileDirection(mistimed, project), /rectangle outside its approved evidence at displayed capture time/);
});

test('client saves cannot author Director-managed lifecycle states', async t => {
  const s = await fixture(t);
  const project = await s.store.create('managed-state', 'Managed state', '#215acb');
  const base = {
    ...launchDirection(),
    profile: 'tour' as const,
    capture: undefined,
    captureFingerprint: undefined,
    poster: { sceneId: 'hook', sceneLocalTime: 2 },
    scenes: [launchDirection().scenes[0]],
  };
  for (const status of ['compiled', 'delivered', 'diverged'] as const) {
    const direction = { ...base, status, ...(['compiled', 'delivered'].includes(status) ? { compiledProjectRevision: project.revision } : {}) };
    await assert.rejects(s.store.saveDirection('managed-state', null, direction), { code: 'DIRECTION_STATE_MANAGED' });
  }
});

test('direction revisions generate review views, compile atomically and detect divergence', async t => {
  const s = await fixture(t);
  const { project, direction } = await recordedTour(s, 'demo', 'Director demo');
  const saved = await s.store.saveDirection('demo', null, direction);
  assert.match(await readFile(path.join(s.store.root, 'projects/demo/direction/BRIEF.md'), 'utf8'), /Director demo|Tour brief/);
  assert.match(await readFile(path.join(s.store.root, 'projects/demo/direction/STORYBOARD.md'), 'utf8'), /reveal/);
  await assert.rejects(s.store.saveDirection('demo', null, direction), { code: 'DIRECTION_REVISION_CONFLICT' });
  const compiled = await s.compileDirector('demo', saved.directionRevision, project.revision);
  assert.equal(compiled.direction.direction.status, 'compiled');
  const packets = await s.prepareScenePackets('demo', compiled.direction.directionRevision, compiled.project.revision);
  assert.equal(packets.packets.length, direction.scenes.length);
  assert.equal(JSON.parse(await readFile(packets.packets[0].path, 'utf8')).baseDirectionRevision, compiled.direction.directionRevision);
  await s.store.save('demo', compiled.project.revision, { ...compiled.project.project, title: 'Manual edit' });
  const diverged = await s.store.getDirection('demo');
  assert.equal(diverged.direction.status, 'diverged');
  await s.store.saveDirection('demo', diverged.directionRevision, { ...diverged.direction, status: 'draft', compiledProjectRevision: undefined });
  const archived = await readFile(path.join(s.store.root, 'projects/demo/direction/revisions', `${compiled.direction.directionRevision}.json`), 'utf8');
  assert.equal(createHash('sha256').update(archived).digest('hex'), compiled.direction.directionRevision);
  assert.equal(JSON.parse(archived).status, 'compiled');
});

test('delivery requires a matching successful final render and strict media report', async t => {
  const s = await fixture(t);
  const { project, direction } = await recordedTour(s, 'delivery-demo', 'Delivery demo');
  const saved = await s.store.saveDirection('delivery-demo', null, direction);
  const compiled = await s.compileDirector('delivery-demo', saved.directionRevision, project.revision);
  const jobId = 'delivery-job';
  const output = path.join(s.store.root, 'jobs', jobId, 'output');
  const review = path.join(output, 'review');
  const scenePreview = path.join(output, 'scenes', '01-text.png');
  await mkdir(review, { recursive: true });
  await mkdir(path.dirname(scenePreview), { recursive: true });
  const artifacts = {
    video: path.join(output, 'democena.mp4'),
    quality: path.join(review, 'quality.json'),
    poster: path.join(review, 'poster.jpg'),
    contactSheet: path.join(review, 'contact-sheet.jpg'),
    storyboard: path.join(output, 'storyboard.json'),
    preview: path.join(output, 'preview.png'),
    scenes: [{ id: 'hook', type: 'text', output: scenePreview }],
  };
  for (const file of [artifacts.video, artifacts.poster, artifacts.contactSheet, artifacts.storyboard, artifacts.preview, scenePreview]) await writeFile(file, 'artifact');
  await writeFile(path.join(s.store.root, 'jobs', jobId, 'job.json'), JSON.stringify({
    jobId,
    projectId: 'delivery-demo',
    revision: compiled.project.revision,
    directionRevision: compiled.direction.directionRevision,
    mode: 'video',
    status: 'succeeded',
    createdAt: new Date().toISOString(),
    artifacts,
  }));
  const quality = {
    status: 'passed',
    strict: true,
    project: { fps: 30, durationInFrames: 30 },
    media: { streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, pix_fmt: 'yuv420p', r_frame_rate: '30/1' }], format: { duration: '1.000000' } },
  };
  await assert.rejects(s.deliverDirection('delivery-demo', 'c'.repeat(64), compiled.project.revision, jobId), { code: 'STALE_RENDER' });
  await writeFile(artifacts.quality, JSON.stringify({ ...quality, strict: false }));
  await assert.rejects(s.deliverDirection('delivery-demo', compiled.direction.directionRevision, compiled.project.revision, jobId), { code: 'DELIVERY_NOT_READY' });
  await writeFile(artifacts.quality, JSON.stringify(quality));
  await assert.rejects(s.deliverDirection('delivery-demo', compiled.direction.directionRevision, compiled.project.revision, jobId), { code: 'DELIVERY_NOT_READY' });
  await promisify(execFile)('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', artifacts.video]);
  await rm(scenePreview);
  await assert.rejects(s.deliverDirection('delivery-demo', compiled.direction.directionRevision, compiled.project.revision, jobId), { code: 'DELIVERY_NOT_READY' });
  await writeFile(scenePreview, 'artifact');
  const delivered = await s.deliverDirection('delivery-demo', compiled.direction.directionRevision, compiled.project.revision, jobId);
  assert.equal(delivered.direction.status, 'delivered');
  assert.equal(delivered.delivery.jobId, jobId);
});

test('scene drafts are revision-bound and merge back into an unreviewed direction', async t => {
  const s = await fixture(t);
  const { project, direction } = await recordedTour(s, 'draft-demo', 'Draft demo');
  const saved = await s.store.saveDirection('draft-demo', null, direction);
  const compiled = await s.compileDirector('draft-demo', saved.directionRevision, project.revision);
  const prepared = await s.prepareScenePackets('draft-demo', compiled.direction.directionRevision, compiled.project.revision);
  for (const preparedPacket of prepared.packets) {
    const packet = JSON.parse(await readFile(preparedPacket.path, 'utf8'));
    const draftFile = path.join(s.store.root, 'projects/draft-demo', packet.output);
    await mkdir(path.dirname(draftFile), { recursive: true });
    await writeFile(draftFile, JSON.stringify({ version: 1, sceneId: packet.sceneId, baseDirectionRevision: packet.baseDirectionRevision, baseProjectRevision: packet.baseProjectRevision, captureFingerprint: packet.captureFingerprint, scene: packet.approvedScene }));
  }
  const merged = await s.mergeSceneDraftFiles('draft-demo', compiled.direction.directionRevision, compiled.project.revision);
  assert.equal(merged.direction.status, 'draft');
  assert.equal(merged.requiresReview, true);
  assert.equal(merged.mergedSceneCount, direction.scenes.length);
});

test('plan-only directions block capture adoption, capture and rendering entry points', async t => {
  const s = await fixture(t);
  const project = await s.store.create('plan-only', 'Plan only', '#215acb');
  const launch = launchDirection();
  const direction = {
    ...launch,
    executionMode: 'plan-only' as const,
    profile: 'tour' as const,
    capture: undefined,
    captureFingerprint: undefined,
    poster: { sceneId: 'hook', sceneLocalTime: 2 },
    scenes: [launch.scenes[0]],
  };
  await s.store.saveDirection('plan-only', null, direction);
  const plan = { url: 'http://localhost:4173', steps: [{ id: 'result', action: 'expect' as const, target: { testId: 'result' } }] };
  await assert.rejects(s.startCapture('plan-only', project.revision, plan), { code: 'PLAN_ONLY' });
  await assert.rejects(s.startRender('plan-only', project.revision, 'preview'), { code: 'PLAN_ONLY' });
  await assert.rejects(s.useCapture('plan-only', project.revision, 'missing-job'), { code: 'PLAN_ONLY' });
  assert.deepEqual(await readdir(path.join(s.store.root, 'jobs')), []);
});

test('matching capture jobs are resumed instead of duplicated', async t => {
  const s = await fixture(t);
  const project = await s.store.create('demo', 'Capture', '#215acb');
  const plan = { url: 'http://localhost:4173', steps: [{ id: 'result', action: 'expect' as const, target: { testId: 'result' } }] };
  const inputDigest = digest({ operation: 'capture', projectRevision: project.revision, plan });
  const dir = path.join(s.store.root, 'jobs', 'existing-job');
  await mkdir(dir);
  await writeFile(path.join(dir, 'job.json'), JSON.stringify({ jobId: 'existing-job', projectId: 'demo', revision: project.revision, inputDigest, mode: 'capture', status: 'queued', createdAt: new Date().toISOString() }));
  const resumed = await s.startCapture('demo', project.revision, plan);
  assert.equal(resumed.jobId, 'existing-job');
  assert.equal('reused' in resumed && resumed.reused, true);
  assert.equal((await readdir(path.join(s.store.root, 'jobs'))).length, 1);
});

test('simultaneous matching capture requests create one durable job', async t => {
  const s = await fixture(t);
  const project = await s.store.create('demo', 'Capture', '#215acb');
  const plan = { url: 'http://localhost:4173', buildIdentity: 'fixture-commit', steps: [{ id: 'result', action: 'expect' as const, target: { testId: 'result' } }] };
  (s as unknown as { launchWorker: () => Promise<void> }).launchWorker = async () => { await new Promise((resolve) => setTimeout(resolve, 75)); };
  const [first, second] = await Promise.all([
    s.startCapture('demo', project.revision, plan),
    s.startCapture('demo', project.revision, plan),
  ]);
  assert.equal(first.jobId, second.jobId);
  assert.equal([first, second].filter((job) => 'reused' in job && job.reused).length, 1);
  assert.equal((await readdir(path.join(s.store.root, 'jobs'))).length, 1);
});
