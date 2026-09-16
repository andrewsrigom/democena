import { access, copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Workspace, atomicJson } from './storage.js';
import { AgentError, capabilities, inputs, type Operation, validate, describeProject } from './contracts.js';

const exec = promisify(execFile);
export const studioDir = fileURLToPath(new URL('../../../../studio/', import.meta.url));
export async function probe(file: string) {
  let stdout: string;
  try { ({ stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { timeout: 30000, maxBuffer: 1024 * 1024 })); }
  catch (error) { throw new AgentError('MEDIA_PROBE_FAILED', `Cannot inspect recording. Install ffprobe and verify the file: ${error instanceof Error ? error.message : error}`); }
  const info = JSON.parse(stdout);
  const duration = Number(info.format?.duration);
  const { width, height } = info.streams?.[0] ?? {};
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) throw new AgentError('INVALID_MEDIA', 'Recording needs a video stream, positive dimensions and a known positive duration.');
  return { duration, width, height };
}
export type Job = { jobId: string; projectId: string; revision: string; mode: 'preview' | 'video'; status: 'queued' | 'running' | 'succeeded' | 'failed'; createdAt: string; pid?: number; finishedAt?: string; error?: string; artifacts?: { preview: string; storyboard: string; video?: string; scenes: { id: string; type: string; output: string }[] } };
export class AgentService {
  constructor(public store: Workspace) {}
  async actualProject(id: string) {
    const saved = await this.store.get(id);
    const { project } = saved;
    if (project.scenes.some(s => !['text', 'chapter', 'outro'].includes(s.type))) {
      const media = await this.store.safe(`projects/${id}/public/${project.video}`);
      const actual = await probe(media);
      if (project.viewport.width !== actual.width || project.viewport.height !== actual.height) throw new AgentError('MEDIA_MISMATCH', 'Recording dimensions changed. Import the recording again.');
      validate({ ...project, sourceDuration: actual.duration });
      if (Math.abs(actual.duration - project.sourceDuration) > 1 / 30) throw new AgentError('MEDIA_MISMATCH', 'Recording duration changed. Import the recording again.');
    }
    return saved;
  }
  async importMedia(id: string, expectedRevision: string, source: string) {
    const ext = path.extname(source).toLowerCase();
    if (!['.mp4', '.webm'].includes(ext)) throw new AgentError('INVALID_MEDIA', 'Use an MP4 or WebM recording.');
    const input = await this.store.safe(source);
    if (!(await stat(input)).isFile()) throw new AgentError('INVALID_MEDIA', 'Source must be a regular video file.');
    const lock = await this.store.safe(`projects/${id}/.write-lock`);
    await mkdir(lock).catch((e: NodeJS.ErrnoException) => { if (e.code === 'EEXIST') throw new AgentError('PROJECT_BUSY', 'Another writer is saving this project. Read it again before retrying.'); throw e; });
    let copied: string | undefined;
    try {
      const current = await this.store.get(id);
      if (current.revision !== expectedRevision) throw new AgentError('REVISION_CONFLICT', 'The project has changed. Read it again and reconcile your edits.');
      const relative = `captures/${randomUUID()}${ext}`;
      await mkdir(await this.store.safe(`projects/${id}/public/captures`), { recursive: true });
      copied = await this.store.safe(`projects/${id}/public/${relative}`);
      await copyFile(input, copied);
      const actual = await probe(copied);
      const project = validate({ ...current.project, video: relative, sourceDuration: actual.duration, trimBefore: 0, viewport: { width: actual.width, height: actual.height } });
      await this.store.commit(id, current.revision, current.project, project);
      copied = undefined;
      return await this.store.get(id);
    } finally { if (copied) await rm(copied, { force: true }); await rm(lock, { recursive: true, force: true }); }
  }
  async startRender(id: string, expectedRevision: string, mode: 'preview' | 'video') {
    const current = await this.actualProject(id);
    if (current.revision !== expectedRevision) throw new AgentError('REVISION_CONFLICT', 'The project has changed. Read it again before rendering.');
    await access(path.join(studioDir, 'node_modules/@remotion/renderer')).catch(() => { throw new AgentError('STUDIO_NOT_INSTALLED', 'Run npm run studio:install in the Democena checkout, then install Chromium with npx playwright install chromium.'); });
    const jobId = randomUUID();
    const dir = await this.store.safe(`jobs/${jobId}`);
    await mkdir(dir);
    await mkdir(path.join(dir, 'public'));
    if (current.project.video) {
      const target = path.join(dir, 'public', current.project.video);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(await this.store.safe(`projects/${id}/public/${current.project.video}`), target);
    }
    await atomicJson(path.join(dir, 'project.json'), current.project);
    const job: Job = { jobId, projectId: id, revision: current.revision, mode, status: 'queued', createdAt: new Date().toISOString() };
    await atomicJson(path.join(dir, 'job.json'), job);
    const child = spawn(process.execPath, [fileURLToPath(new URL('./worker.js', import.meta.url)), this.store.root, jobId], { detached: true, stdio: 'ignore', windowsHide: true });
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }).catch(async error => { await atomicJson(path.join(dir, 'job.json'), { ...job, status: 'failed', error: String(error) }); throw error; });
    child.unref();
    return { ...job, next: 'Poll get_job; after success, inspect read_preview before requesting the final video.' };
  }
  async getJob(jobId: string): Promise<Job> {
    const file = await this.store.safe(`jobs/${jobId}/job.json`);
    const job = JSON.parse(await readFile(file, 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') throw new AgentError('NOT_FOUND', `Job ${jobId} does not exist.`); throw e; })) as Job;
    if (job.status === 'running' && job.pid) {
      try { process.kill(job.pid, 0); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
          // The worker may have committed success between our read and its process exit.
          const latest = JSON.parse(await readFile(file, 'utf8')) as Job;
          if (latest.status === 'succeeded' || latest.status === 'failed') return latest;
          return { ...latest, status: 'failed', error: 'Render worker stopped unexpectedly. Start a new render.' };
        }
      }
    }
    if (['queued', 'running'].includes(job.status) && Date.now() - Date.parse(job.createdAt) > 25 * 60 * 1000) return { ...job, status: 'failed', error: 'Render exceeded its deadline. Start a new render.' };
    return job;
  }
  async preview(jobId: string, sceneId?: string) {
    const job = await this.getJob(jobId);
    if (job.status !== 'succeeded' || !job.artifacts) throw new AgentError('JOB_NOT_READY', `Job is ${job.status}. Inspect get_job before requesting an image.`);
    const artifact = sceneId === undefined ? job.artifacts.preview : job.artifacts.scenes.find(s => s.id === sceneId)?.output;
    if (!artifact) throw new AgentError('NOT_FOUND', 'No preview exists for that scene ID.');
    const file = await this.store.safe(path.relative(this.store.root, artifact));
    const allowed = path.join(this.store.root, 'jobs', jobId, 'output') + path.sep;
    if (!file.startsWith(allowed) || path.extname(file) !== '.png') throw new AgentError('INVALID_PATH', 'Preview must belong to this render job.');
    if ((await stat(file)).size > 16 * 1024 * 1024) throw new AgentError('IMAGE_TOO_LARGE', 'Preview exceeds 16 MiB; inspect the local artifact instead.');
    return { jobId, sceneId, path: file, mimeType: 'image/png', data: (await readFile(file)).toString('base64') };
  }
  async call(name: Operation, value: unknown): Promise<Record<string, unknown>> {
    switch (name) {
      case 'capabilities': inputs.capabilities.parse(value); return capabilities();
      case 'list_projects': inputs.list_projects.parse(value); return this.store.list();
      case 'create_project': { const a = inputs.create_project.parse(value); return this.store.create(a.projectId, a.title, a.accent); }
      case 'get_project': { const a = inputs.get_project.parse(value); return this.store.get(a.projectId); }
      case 'save_project': { const a = inputs.save_project.parse(value); return this.store.save(a.projectId, a.expectedRevision, a.project); }
      case 'import_media': { const a = inputs.import_media.parse(value); return this.importMedia(a.projectId, a.expectedRevision, a.source); }
      case 'validate_project': { const a = inputs.validate_project.parse(value); const p = await this.actualProject(a.projectId); return { projectId: p.projectId, revision: p.revision, valid: true, ...describeProject(p.project) }; }
      case 'start_render': { const a = inputs.start_render.parse(value); return this.startRender(a.projectId, a.expectedRevision, a.mode); }
      case 'get_job': { const a = inputs.get_job.parse(value); return this.getJob(a.jobId) as unknown as Record<string, unknown>; }
      case 'read_preview': { const a = inputs.read_preview.parse(value); return this.preview(a.jobId, a.sceneId); }
    }
  }
}
