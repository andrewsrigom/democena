import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const fixture = path.resolve(process.argv[2] ?? path.join(repo, 'studio'));
const template = JSON.parse(await readFile(path.join(fixture, 'project.json'), 'utf8'));
await mkdir(path.join(repo, 'studio/.cache'), { recursive: true });
const workspace = await mkdtemp(path.join(repo, 'studio/.cache/agent-smoke-'));
await mkdir(path.join(workspace, 'assets'));
await copyFile(path.join(fixture, 'public', template.video), path.join(workspace, 'assets/parcel.webm'));
const server = path.join(repo, 'mcp/dist/mcp/src/index.js');
let client;
async function connect() {
  client = new Client({ name: 'democena-smoke', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server, '--workspace', workspace], stderr: 'inherit' }));
}
async function call(name, args = {}) {
  const result = await client.callTool({ name: `democena_${name}`, arguments: args });
  assert(!result.isError, JSON.stringify(result));
  assert.equal(result.structuredContent.ok, true);
  return result;
}
async function wait(jobId) {
  for (let i = 0; i < 600; i++) {
    const job = (await call('get_job', { jobId })).structuredContent;
    if (job.status === 'succeeded') return job;
    assert.notEqual(job.status, 'failed', job.error);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Render did not complete before the smoke-test deadline.');
}
try {
  await connect();
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 10);
  await call('capabilities');
  let p = (await call('create_project', { projectId: 'parcel-story', title: 'Created by an agent' })).structuredContent;
  p = (await call('import_media', { projectId: p.projectId, expectedRevision: p.revision, source: 'assets/parcel.webm' })).structuredContent;
  p = (await call('save_project', { projectId: p.projectId, expectedRevision: p.revision, project: { ...p.project, trimBefore: template.trimBefore, scenes: template.scenes, title: 'Agent-created Parcel Desk story' } })).structuredContent;
  await call('validate_project', { projectId: p.projectId });
  const previewStart = (await call('start_render', { projectId: p.projectId, expectedRevision: p.revision, mode: 'preview' })).structuredContent;
  // Real process disconnect/reconnect while the worker continues rendering.
  await client.close();
  await connect();
  const preview = await wait(previewStart.jobId);
  assert.equal(preview.artifacts.scenes.length, 8);
  for (const scene of template.scenes) {
    const result = await call('read_preview', { jobId: preview.jobId, sceneId: scene.id });
    const image = result.content.find(c => c.type === 'image');
    assert.equal(image.mimeType, 'image/png');
    assert.equal(Buffer.from(image.data, 'base64').subarray(1, 4).toString(), 'PNG');
  }
  console.log(JSON.stringify({ phase: 'preview', workspace, jobId: preview.jobId, artifacts: preview.artifacts }));
  const videoStart = (await call('start_render', { projectId: p.projectId, expectedRevision: p.revision, mode: 'video' })).structuredContent;
  // Edit while rendering: the job must retain the revision it started from.
  const edited = (await call('save_project', { projectId: p.projectId, expectedRevision: p.revision, project: { ...p.project, title: 'Edited after the render started' } })).structuredContent;
  const video = await wait(videoStart.jobId);
  assert.equal(video.revision, p.revision);
  assert.notEqual(video.revision, edited.revision);
  const snapshot = JSON.parse(await readFile(path.join(workspace, 'jobs', video.jobId, 'project.json'), 'utf8'));
  assert.equal(snapshot.title, p.project.title);
  assert.equal(video.artifacts.scenes.length, 8);
  const result = { ok: true, workspace, projectId: p.projectId, revision: video.revision, tools: tools.tools.length, sceneCount: 8, reconnectVerified: true, snapshotVerified: true, previewJob: preview.jobId, videoJob: video.jobId, artifacts: video.artifacts };
  await writeFile(path.join(workspace, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await client?.close(); }
