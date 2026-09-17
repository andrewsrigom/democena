import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startExample } from '../../examples/basic/app.mjs';
import { formaLaunchDirection, formaPlan, formaScenes } from '../../examples/basic/story.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
await mkdir(path.join(repo, 'studio/.cache'), { recursive: true });
const workspace = await mkdtemp(path.join(repo, 'studio/.cache/agent-smoke-'));
const app = await startExample();
const server = path.join(repo, 'mcp/dist/mcp/src/index.js');
let client;
async function connect() {
  client = new Client({ name: 'democena-smoke', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server, '--workspace', workspace], stderr: 'inherit' }));
}
async function raw(name, args = {}) { return client.callTool({ name: `democena_${name}`, arguments: args }); }
async function call(name, args = {}) {
  const result = await raw(name, args);
  assert(!result.isError, JSON.stringify(result));
  assert.equal(result.structuredContent.ok, true);
  return result;
}
async function wait(jobId, expected = 'succeeded') {
  for (let i = 0; i < 600; i++) {
    const job = (await call('get_job', { jobId })).structuredContent;
    if (['succeeded', 'failed'].includes(job.status)) { assert.equal(job.status, expected, job.error); return job; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Job did not complete before the smoke-test deadline.');
}
async function inspect(jobId, sceneId, mimeType = 'image/png') {
  const result = await call('read_preview', { jobId, ...(sceneId ? { sceneId } : {}) });
  const image = result.content.find(c => c.type === 'image');
  assert.equal(image.mimeType, mimeType);
  const bytes = Buffer.from(image.data, 'base64');
  if (mimeType === 'image/png') assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  else assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
}
try {
  await connect();
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 20);
  assert.equal(tools.tools.find(t => t.name === 'democena_start_capture').annotations.openWorldHint, true);
  await call('capabilities');
  let p = (await call('create_project', { projectId: 'forma-story', title: 'Forma — the spring edit', branding: { name: 'Forma', tagline: 'COLLECTIONS, IN MOTION', footer: 'YOUR COLLECTION, READY TO SHARE' } })).structuredContent;
  await writeFile(path.join(workspace, 'assets/forma-logo.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nWQAAAAASUVORK5CYII=', 'base64'));
  p = (await call('import_brand_logo', { projectId: p.projectId, expectedRevision: p.revision, source: 'assets/forma-logo.png' })).structuredContent;
  assert.match(p.project.branding.logo, /^branding\/[a-f0-9-]+\.png$/);
  const initial = p;
  const take = (await call('start_capture', { projectId: p.projectId, expectedRevision: p.revision, plan: formaPlan(app.url) })).structuredContent;
  // Real disconnection while the independent worker records the application.
  await client.close();
  await connect();
  const recovered = (await call('list_jobs', { projectId: p.projectId })).structuredContent.jobs;
  assert(recovered.some(job => job.jobId === take.jobId));
  const captured = await wait(take.jobId);
  assert.equal(captured.capture.events.length, 15);
  assert.equal(captured.capture.events.filter(e => e.verified).length, 4);
  for (const e of captured.capture.events) {
    assert(e.at >= 0 && e.end >= e.at);
    if (e.box) assert(e.box.width > 0 && e.box.height > 0);
    if (e.screenshot) await inspect(captured.jobId, e.id);
  }
  assert.equal((await call('get_project', { projectId: p.projectId })).structuredContent.revision, p.revision);
  // Edits made during a take survive, and an outdated adoption cannot silently overwrite them.
  p = (await call('save_project', { projectId: p.projectId, expectedRevision: p.revision, project: { ...p.project, title: 'Forma — your collection, ready to share' } })).structuredContent;
  const stale = await raw('use_capture', { projectId: p.projectId, expectedRevision: initial.revision, jobId: take.jobId });
  assert.equal(stale.structuredContent.error.code, 'REVISION_CONFLICT');
  p = (await call('use_capture', { projectId: p.projectId, expectedRevision: p.revision, jobId: take.jobId })).structuredContent;
  assert.equal(p.project.scenes[0].title, initial.project.scenes[0].title);
  const captureMedia = p.media;
  const scenes = formaScenes(p.capture);
  p = (await call('save_project', { projectId: p.projectId, expectedRevision: p.revision, project: { ...p.project, scenes } })).structuredContent;
  await call('validate_project', { projectId: p.projectId });
  // A false application claim must produce a failed take, never a successful project edit.
  const bad = (await call('start_capture', { projectId: p.projectId, expectedRevision: p.revision, plan: { url: app.url, steps: [{ id: 'wrong-outcome', action: 'expect', target: { testId: 'product-count' }, text: '999 products' }] } })).structuredContent;
  const failed = await wait(bad.jobId, 'failed');
  assert.match(failed.error, /wrong-outcome/);
  assert.equal((await call('get_project', { projectId: p.projectId })).structuredContent.revision, p.revision);
  const rejected = await raw('use_capture', { projectId: p.projectId, expectedRevision: p.revision, jobId: bad.jobId });
  assert.equal(rejected.structuredContent.error.code, 'CAPTURE_NOT_READY');
  console.log(JSON.stringify({ phase: 'capture', workspace, jobId: captured.jobId, failureVerified: true }));

  const previewStart = (await call('start_render', { projectId: p.projectId, expectedRevision: p.revision, mode: 'preview' })).structuredContent;
  await client.close();
  await connect();
  const preview = await wait(previewStart.jobId);
  assert(scenes.every(scene => preview.artifacts.scenes.some(artifact => artifact.id === scene.id)));
  for (const scene of scenes) await inspect(preview.jobId, scene.id);
  await inspect(preview.jobId, 'review-contact-sheet', 'image/jpeg');
  await inspect(preview.jobId, 'review-poster', 'image/jpeg');
  assert.equal(JSON.parse(await readFile(preview.artifacts.quality, 'utf8')).status, 'passed');
  console.log(JSON.stringify({ phase: 'preview', workspace, jobId: preview.jobId, artifacts: preview.artifacts }));
  const videoStart = (await call('start_render', { projectId: p.projectId, expectedRevision: p.revision, mode: 'video' })).structuredContent;
  const edited = (await call('save_project', { projectId: p.projectId, expectedRevision: p.revision, project: { ...p.project, title: 'Edited after the render started' } })).structuredContent;
  const video = await wait(videoStart.jobId);
  assert.equal(video.revision, p.revision);
  assert.notEqual(video.revision, edited.revision);
  const snapshot = JSON.parse(await readFile(path.join(workspace, 'jobs', video.jobId, 'project.json'), 'utf8'));
  assert.equal(snapshot.title, p.project.title);
  assert(scenes.every(scene => video.artifacts.scenes.some(artifact => artifact.id === scene.id)));

  let launch = (await call('create_project', { projectId: 'forma-launch', title: 'Forma — launch cut', branding: { name: 'Forma', tagline: 'COLLECTIONS, IN MOTION', footer: 'READY TO SHARE' } })).structuredContent;
  launch = (await call('use_capture', { projectId: launch.projectId, expectedRevision: launch.revision, jobId: captured.jobId, allowCrossProjectReuse: true })).structuredContent;
  assert.equal(launch.media.captureFingerprint, captureMedia.captureFingerprint);
  const direction = (await call('save_direction', { projectId: launch.projectId, expectedDirectionRevision: null, direction: formaLaunchDirection(launch.capture, launch.media) })).structuredContent;
  const compiled = (await call('compile_direction', { projectId: launch.projectId, expectedDirectionRevision: direction.directionRevision, expectedProjectRevision: launch.revision })).structuredContent;
  assert(compiled.compiledDuration >= 15 && compiled.compiledDuration <= 25);
  const launchPreview = await wait((await call('start_render', { projectId: launch.projectId, expectedRevision: compiled.project.revision, mode: 'preview' })).structuredContent.jobId);
  const previewQuality = JSON.parse(await readFile(launchPreview.artifacts.quality, 'utf8'));
  assert.equal(previewQuality.strict, true);
  assert.equal(previewQuality.status, 'passed');
  await inspect(launchPreview.jobId, 'review-contact-sheet', 'image/jpeg');
  const launchVideo = await wait((await call('start_render', { projectId: launch.projectId, expectedRevision: compiled.project.revision, mode: 'video' })).structuredContent.jobId);
  const launchQuality = JSON.parse(await readFile(launchVideo.artifacts.quality, 'utf8'));
  assert.equal(launchQuality.status, 'passed');
  assert.equal(launchQuality.media.streams.some(stream => stream.codec_type === 'audio'), false);
  const delivered = (await call('deliver_direction', { projectId: launch.projectId, expectedDirectionRevision: compiled.direction.directionRevision, expectedProjectRevision: compiled.project.revision, jobId: launchVideo.jobId })).structuredContent;
  assert.equal(delivered.direction.status, 'delivered');

  const result = { ok: true, workspace, projectId: p.projectId, revision: video.revision, tools: tools.tools.length, sceneCount: scenes.length, sceneTypes: new Set(scenes.map(s => s.type)).size, reconnectVerified: true, jobRecoveryVerified: true, brandingVerified: true, snapshotVerified: true, failedCaptureVerified: true, crossProjectReuseVerified: true, deliveryVerified: true, launchDuration: compiled.compiledDuration, captureJob: captured.jobId, previewJob: preview.jobId, videoJob: video.jobId, launchPreviewJob: launchPreview.jobId, launchVideoJob: launchVideo.jobId, artifacts: video.artifacts, launchArtifacts: launchVideo.artifacts };
  await writeFile(path.join(workspace, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await client?.close(); await app.close(); }
