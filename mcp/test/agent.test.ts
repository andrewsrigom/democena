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
import { capabilities, validate } from '../src/contracts.js';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'democena-agent-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return new AgentService(await Workspace.open(root));
}
test('all eight discoverable examples pass the shared Studio validator', () => {
  const scenes = capabilities().examples.map((s, i) => ({ ...s, id: `scene-${i}` }));
  assert.equal(scenes.length, 8);
  assert.equal(validate({ version: 2, title: 'Demo', accent: '#28584c', video: 'captures/demo.webm', sourceDuration: 10, trimBefore: 0, viewport: { width: 1280, height: 800 }, scenes }).scenes.length, 8);
});
test('create, read, save and list preserve revisions and reject stale writes', async t => {
  const s = await fixture(t);
  const created = await s.store.create('demo', 'First', '#28584c');
  await assert.rejects(s.store.create('demo', 'Other', '#28584c'), { code: 'ALREADY_EXISTS' });
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
  const p = await s.store.create('demo', 'First', '#28584c');
  const results = await Promise.allSettled(['A','B'].map(title => s.store.save('demo', p.revision, { ...p.project, title })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});
test('invalid scenes and unimported media do not modify the saved project', async t => {
  const s = await fixture(t);
  const p = await s.store.create('demo', 'First', '#28584c');
  await assert.rejects(s.store.save('demo', p.revision, { ...p.project, scenes: [{ ...p.project.scenes[0], type: 'focus', focus: { x: 0, y: 0, width: 10, height: 10 }, source: { from: 0 } }] }), { code: 'INVALID_PROJECT' });
  await assert.rejects(s.store.save('demo', p.revision, { ...p.project, video: 'captures/not-imported.webm' }), { code: 'MEDIA_CHANGE_REQUIRES_IMPORT' });
  assert.equal((await s.store.get('demo')).revision, p.revision);
});
test('source paths cannot escape the workspace or follow symlinks', async t => {
  const s = await fixture(t);
  await assert.rejects(s.store.safe('../outside.mp4'), { code: 'INVALID_PATH' });
  await assert.rejects(s.store.safe('/tmp/outside.mp4'), { code: 'INVALID_PATH' });
  await symlink(tmpdir(), path.join(s.store.root, 'assets/link'));
  await assert.rejects(s.store.safe('assets/link/outside.mp4'), { code: 'INVALID_PATH' });
  await assert.rejects(s.call('get_project', { projectId: '../demo' }));
});
test('warnings distinguish valid timing from layout and reading concerns', async t => {
  const s = await fixture(t);
  const p = await s.store.create('demo', 'A very long title '.repeat(8), '#28584c');
  assert(p.warnings.some(w => w.code === 'READING_TIME'));
  assert(p.warnings.some(w => w.code === 'TEXT_LAYOUT'));
  assert.equal(p.durationInFrames, 150);
});
test('missing jobs and unfinished previews report actionable errors', async t => {
  const s = await fixture(t);
  await assert.rejects(s.getJob('unknown'), { code: 'NOT_FOUND' });
  await assert.rejects(s.call('read_preview', { jobId: '../outside' }));
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
  assert.equal((await client.listTools()).tools.length, 10);
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
  const p = await s.store.create('demo', 'First', '#28584c');
  await writeFile(path.join(s.store.root, 'assets/broken.mp4'), 'not a recording');
  await assert.rejects(s.importMedia('demo', p.revision, 'assets/broken.mp4'), { code: 'MEDIA_PROBE_FAILED' });
  assert.equal((await s.store.get('demo')).revision, p.revision);
  assert.deepEqual(await readdir(path.join(s.store.root, 'projects/demo/public/captures')), []);
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
