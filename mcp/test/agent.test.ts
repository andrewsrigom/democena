import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AgentService } from '../src/service.js';
import { Workspace } from '../src/storage.js';
import { capturePlanSchema } from '../src/capture-contracts.js';
import { capabilities, validate } from '../src/contracts.js';
import { captureFingerprint, compileDirection, digest } from '../src/direction.js';
import { example } from '../../studio/src/model.js';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'democena-agent-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  return new AgentService(await Workspace.open(root));
}
test('all eight discoverable examples pass the shared Studio validator', () => {
  assert.equal(example.branding, undefined);
  const scenes = capabilities().examples.map((s, i) => ({ ...s, id: `scene-${i}` }));
  assert.equal(scenes.length, 8);
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
  assert.equal((await client.listTools()).tools.length, 19);
  assert.equal((await client.listResources()).resources.length, 2);
  assert((await client.readResource({ uri: 'democena://guide' })).contents.length > 0);
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
  };
  const authored = (claim: string) => [{ kind: 'authored-copy' as const, claim }];
  const captured = (timestamp: number, verified = false) => [{ kind: 'capture' as const, timestamp, verified }];
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
      { narrativeRole: 'hook' as const, reason: 'State the value.', expectedSettledAt: 2, evidence: authored('A concise product promise.'), scene: { id: 'hook', type: 'text' as const, duration: 4, eyebrow: 'Catalog work', title: 'Ready sooner.', body: 'Turn a product list into a useful catalog.' } },
      { narrativeRole: 'product-reveal' as const, reason: 'Show the real product.', expectedSettledAt: 2, evidence: captured(0), scene: { id: 'reveal', type: 'overview' as const, duration: 4, eyebrow: 'The workspace', title: 'One clear flow.', body: 'Work from the captured application.', source: { from: 0, freeze: true } } },
      { narrativeRole: 'verified-result' as const, reason: 'Prove the result.', expectedSettledAt: 2, evidence: captured(4, true), scene: { id: 'result', type: 'result' as const, duration: 4, eyebrow: 'Published', title: 'The result is visible.', body: 'The assertion and captured frame agree.', source: { from: 4, freeze: true } } },
      { narrativeRole: 'closing' as const, reason: 'Close on the benefit.', expectedSettledAt: 2, evidence: authored('Restate the approved benefit.'), scene: { id: 'closing', type: 'outro' as const, duration: 4, eyebrow: 'CatalogForge', title: 'Ready to share.', body: 'A clear catalog with a clear next step.' } },
    ],
  };
}

test('launch compilation enforces shape, evidence and a 15-25 second runtime', () => {
  const direction = launchDirection();
  const project = validate({ version: 2, title: 'CatalogForge', accent: '#402c8f', video: 'captures/demo.webm', sourceDuration: 20, trimBefore: 0, viewport: { width: 1280, height: 800 }, scenes: [direction.scenes[0].scene] });
  const compiled = compileDirection(direction, project);
  assert.equal(compiled.project.scenes.length, 4);
  assert(compiled.duration >= 15 && compiled.duration <= 25);
  assert.throws(() => compileDirection({ ...direction, scenes: direction.scenes.map((entry) => entry.narrativeRole === 'verified-result' ? { ...entry, evidence: [{ kind: 'capture', timestamp: 4, verified: false }] } : entry) }, project), /verified result/);
});

test('direction revisions generate review views, compile atomically and detect divergence', async t => {
  const s = await fixture(t);
  const project = await s.store.create('demo', 'Director demo', '#215acb');
  const direction = {
    ...launchDirection(),
    profile: 'tour' as const,
    capture: undefined,
    captureFingerprint: undefined,
    poster: { sceneId: 'hook', sceneLocalTime: 2 },
    scenes: [launchDirection().scenes[0]],
  };
  const saved = await s.store.saveDirection('demo', null, direction);
  assert.match(await readFile(path.join(s.store.root, 'projects/demo/direction/BRIEF.md'), 'utf8'), /Director demo|Tour brief/);
  assert.match(await readFile(path.join(s.store.root, 'projects/demo/direction/STORYBOARD.md'), 'utf8'), /hook/);
  await assert.rejects(s.store.saveDirection('demo', null, direction), { code: 'DIRECTION_REVISION_CONFLICT' });
  const compiled = await s.compileDirector('demo', saved.directionRevision, project.revision);
  assert.equal(compiled.direction.direction.status, 'compiled');
  const packets = await s.prepareScenePackets('demo', compiled.direction.directionRevision, compiled.project.revision);
  assert.equal(packets.packets.length, 1);
  assert.equal(JSON.parse(await readFile(packets.packets[0].path, 'utf8')).baseDirectionRevision, compiled.direction.directionRevision);
  await s.store.save('demo', compiled.project.revision, { ...compiled.project.project, title: 'Manual edit' });
  assert.equal((await s.store.getDirection('demo')).direction.status, 'diverged');
});

test('scene drafts are revision-bound and merge back into an unreviewed direction', async t => {
  const s = await fixture(t);
  const project = await s.store.create('draft-demo', 'Draft demo', '#215acb');
  const direction = {
    ...launchDirection(),
    profile: 'tour' as const,
    capture: undefined,
    captureFingerprint: undefined,
    poster: { sceneId: 'hook', sceneLocalTime: 2 },
    scenes: [launchDirection().scenes[0]],
  };
  const saved = await s.store.saveDirection('draft-demo', null, direction);
  const compiled = await s.compileDirector('draft-demo', saved.directionRevision, project.revision);
  const prepared = await s.prepareScenePackets('draft-demo', compiled.direction.directionRevision, compiled.project.revision);
  const packet = JSON.parse(await readFile(prepared.packets[0].path, 'utf8'));
  const draftFile = path.join(s.store.root, 'projects/draft-demo', packet.output);
  await mkdir(path.dirname(draftFile), { recursive: true });
  await writeFile(draftFile, JSON.stringify({ version: 1, sceneId: packet.sceneId, baseDirectionRevision: packet.baseDirectionRevision, baseProjectRevision: packet.baseProjectRevision, captureFingerprint: packet.captureFingerprint, scene: packet.approvedScene }));
  const merged = await s.mergeSceneDraftFiles('draft-demo', compiled.direction.directionRevision, compiled.project.revision);
  assert.equal(merged.direction.status, 'draft');
  assert.equal(merged.requiresReview, true);
  assert.equal(merged.mergedSceneCount, 1);
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
