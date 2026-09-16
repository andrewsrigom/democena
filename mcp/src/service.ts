import { access, copyFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { CaptureResult } from '../../capture/browser.mjs';
import type { z } from 'zod';
import { capturePlanSchema } from './capture-contracts.js';
import { Workspace, atomicJson } from './storage.js';
import { AgentError, capabilities, inputs, type Operation, validate, describeProject } from './contracts.js';

const exec = promisify(execFile);
const MAX_BRAND_ASSET_BYTES = 8 * 1024 * 1024;
function validBrandAsset(ext: string, data: Buffer) {
  if (ext === '.png') return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === '.jpg' || ext === '.jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (ext === '.webp') return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
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
export type Job = { jobId: string; projectId: string; revision: string; mode: 'preview' | 'video' | 'capture'; status: 'queued' | 'running' | 'succeeded' | 'failed'; createdAt: string; pid?: number; finishedAt?: string; error?: string; capture?: CaptureResult; artifacts?: { preview: string; storyboard?: string; video?: string; recording?: string; events?: string; scenes: { id: string; type: string; output: string }[] } };
export class AgentService {
  constructor(public store: Workspace) {}
  async actualProject(id: string) {
    const saved = await this.store.get(id);
    const { project } = saved;
    if (project.branding?.logo) {
      const logo = await this.store.safe(`projects/${id}/public/${project.branding.logo}`);
      const info = await stat(logo).catch(() => { throw new AgentError('BRAND_ASSET_MISSING', 'The project logo is missing. Import it again or remove branding.logo.'); });
      if (!info.isFile() || info.size === 0 || info.size > MAX_BRAND_ASSET_BYTES) throw new AgentError('INVALID_BRAND_ASSET', 'The project logo must be a nonempty image no larger than 8 MiB.');
      if (!validBrandAsset(path.extname(logo).toLowerCase(), await readFile(logo))) throw new AgentError('INVALID_BRAND_ASSET', 'The project logo contents do not match its PNG, JPEG or WebP extension.');
    }
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
  async importBrandLogo(id: string, expectedRevision: string, source: string) {
    const ext = path.extname(source).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw new AgentError('INVALID_BRAND_ASSET', 'Use a PNG, JPEG or WebP logo.');
    const input = await this.store.safe(source);
    const info = await stat(input);
    if (!info.isFile() || info.size === 0 || info.size > MAX_BRAND_ASSET_BYTES) throw new AgentError('INVALID_BRAND_ASSET', 'Logo source must be a nonempty image no larger than 8 MiB.');
    if (!validBrandAsset(ext, await readFile(input))) throw new AgentError('INVALID_BRAND_ASSET', 'Logo contents do not match the file extension.');
    const lock = await this.store.safe(`projects/${id}/.write-lock`);
    await mkdir(lock).catch((e: NodeJS.ErrnoException) => { if (e.code === 'EEXIST') throw new AgentError('PROJECT_BUSY', 'Another writer is saving this project. Read it again before retrying.'); throw e; });
    let copied: string | undefined;
    try {
      const current = await this.store.get(id);
      if (current.revision !== expectedRevision) throw new AgentError('REVISION_CONFLICT', 'The project has changed. Read it again and reconcile your edits.');
      const relative = `branding/${randomUUID()}${ext}`;
      await mkdir(await this.store.safe(`projects/${id}/public/branding`), { recursive: true });
      copied = await this.store.safe(`projects/${id}/public/${relative}`);
      await copyFile(input, copied);
      const project = validate({ ...current.project, branding: { ...(current.project.branding ?? {}), logo: relative } });
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
    const assets = [current.project.video, current.project.branding?.logo].filter((asset): asset is string => Boolean(asset));
    for (const asset of new Set(assets)) {
      const target = path.join(dir, 'public', asset);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(await this.store.safe(`projects/${id}/public/${asset}`), target);
    }
    await atomicJson(path.join(dir, 'project.json'), current.project);
    const job: Job = { jobId, projectId: id, revision: current.revision, mode, status: 'queued', createdAt: new Date().toISOString() };
    await atomicJson(path.join(dir, 'job.json'), job);
    await this.launchWorker(job, dir);
    return { ...job, next: 'Poll get_job; after success, inspect read_preview before requesting the final video.' };
  }
  async startCapture(id: string, expectedRevision: string, plan: z.infer<typeof capturePlanSchema>) {
    const current = await this.store.get(id);
    if (current.revision !== expectedRevision) throw new AgentError('REVISION_CONFLICT', 'Read the project again before capturing.');
    if (plan.storageState) await access(await this.store.safe(plan.storageState));
    const jobId = randomUUID();
    const dir = await this.store.safe(`jobs/${jobId}`);
    await mkdir(dir);
    await atomicJson(path.join(dir, 'capture-plan.json'), plan);
    const job: Job = { jobId, projectId: id, revision: current.revision, mode: 'capture', status: 'queued', createdAt: new Date().toISOString() };
    await atomicJson(path.join(dir, 'job.json'), job);
    await this.launchWorker(job, dir);
    return { ...job, next: 'Poll get_job, inspect capture marks with read_preview, then use_capture with the current project revision.' };
  }
  async useCapture(id: string, expectedRevision: string, jobId: string) {
    const job = await this.getJob(jobId);
    if (job.mode !== 'capture' || job.status !== 'succeeded' || !job.capture || !job.artifacts?.recording) throw new AgentError('CAPTURE_NOT_READY', 'Choose a successfully completed capture job.');
    if (job.projectId !== id) throw new AgentError('WRONG_PROJECT', 'This capture belongs to a different project.');
    const saved = await this.importMedia(id, expectedRevision, path.relative(this.store.root, job.artifacts.recording));
    return { ...saved, capture: job.capture };
  }
  private async launchWorker(job: Job, dir: string) {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./worker.js', import.meta.url)), this.store.root, job.jobId], { detached: true, stdio: 'ignore', windowsHide: true });
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }).catch(async error => { await atomicJson(path.join(dir, 'job.json'), { ...job, status: 'failed', error: String(error) }); throw error; });
    child.unref();
  }
  async listJobs(projectId?: string, limit = 20) {
    const entries = await readdir(await this.store.safe('jobs'), { withFileTypes: true });
    const jobs: Array<Omit<Job, 'capture'>> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const { capture: _capture, ...job } = await this.getJob(entry.name);
        if (projectId === undefined || job.projectId === projectId) jobs.push(job);
      } catch {
        // Ignore incomplete job directories; get_job remains the diagnostic path for a known ID.
      }
    }
    jobs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return { jobs: jobs.slice(0, limit) };
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
          return { ...latest, status: 'failed', error: 'Job worker stopped unexpectedly. Start a new job.' };
        }
      }
    }
    if (['queued', 'running'].includes(job.status) && Date.now() - Date.parse(job.createdAt) > 25 * 60 * 1000) return { ...job, status: 'failed', error: 'Job exceeded its deadline. Start a new job.' };
    return job;
  }
  async preview(jobId: string, sceneId?: string) {
    const job = await this.getJob(jobId);
    if (job.status !== 'succeeded' || !job.artifacts) throw new AgentError('JOB_NOT_READY', `Job is ${job.status}. Inspect get_job before requesting an image.`);
    const artifact = sceneId === undefined ? job.artifacts.preview : job.artifacts.scenes.find(s => s.id === sceneId)?.output;
    if (!artifact) throw new AgentError('NOT_FOUND', 'No preview exists for that scene ID.');
    const file = await this.store.safe(path.relative(this.store.root, artifact));
    const allowed = path.join(this.store.root, 'jobs', jobId, 'output') + path.sep;
    if (!file.startsWith(allowed) || path.extname(file) !== '.png') throw new AgentError('INVALID_PATH', 'Preview must belong to this job.');
    if ((await stat(file)).size > 16 * 1024 * 1024) throw new AgentError('IMAGE_TOO_LARGE', 'Preview exceeds 16 MiB; inspect the local artifact instead.');
    return { jobId, sceneId, path: file, mimeType: 'image/png', data: (await readFile(file)).toString('base64') };
  }
  async call(name: Operation, value: unknown): Promise<Record<string, unknown>> {
    switch (name) {
      case 'capabilities': inputs.capabilities.parse(value); return capabilities();
      case 'list_projects': inputs.list_projects.parse(value); return this.store.list();
      case 'list_jobs': { const a = inputs.list_jobs.parse(value); return this.listJobs(a.projectId, a.limit); }
      case 'create_project': { const a = inputs.create_project.parse(value); return this.store.create(a.projectId, a.title, a.accent, a.branding); }
      case 'get_project': { const a = inputs.get_project.parse(value); return this.store.get(a.projectId); }
      case 'save_project': { const a = inputs.save_project.parse(value); return this.store.save(a.projectId, a.expectedRevision, a.project); }
      case 'import_media': { const a = inputs.import_media.parse(value); return this.importMedia(a.projectId, a.expectedRevision, a.source); }
      case 'import_brand_logo': { const a = inputs.import_brand_logo.parse(value); return this.importBrandLogo(a.projectId, a.expectedRevision, a.source); }
      case 'start_capture': { const a = inputs.start_capture.parse(value); return this.startCapture(a.projectId, a.expectedRevision, a.plan); }
      case 'use_capture': { const a = inputs.use_capture.parse(value); return this.useCapture(a.projectId, a.expectedRevision, a.jobId); }
      case 'validate_project': { const a = inputs.validate_project.parse(value); const p = await this.actualProject(a.projectId); return { projectId: p.projectId, revision: p.revision, valid: true, ...describeProject(p.project) }; }
      case 'start_render': { const a = inputs.start_render.parse(value); return this.startRender(a.projectId, a.expectedRevision, a.mode); }
      case 'get_job': { const a = inputs.get_job.parse(value); return this.getJob(a.jobId) as unknown as Record<string, unknown>; }
      case 'read_preview': { const a = inputs.read_preview.parse(value); return this.preview(a.jobId, a.sceneId); }
    }
  }
}
