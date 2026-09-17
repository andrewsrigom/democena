import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { CaptureResult } from '../../capture/browser.mjs';
import type { z } from 'zod';
import { capturePlanSchema } from './capture-contracts.js';
import { Workspace, atomicJson } from './storage.js';
import { AgentError, capabilities, inputs, type Operation, validate, describeProject } from './contracts.js';
import { captureFingerprint, compileDirection, digest, mergeSceneDrafts, scenePackets, type CaptureMetadata } from './direction.js';

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
async function probeFinalVideo(file: string) {
  let stdout: string;
  try {
    ({ stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate:format=duration', '-of', 'json', file], { timeout: 30000, maxBuffer: 1024 * 1024 }));
  } catch {
    throw new AgentError('DELIVERY_NOT_READY', 'The final video artifact is unreadable or incomplete. Render it again before delivery.');
  }
  try {
    const report = JSON.parse(stdout) as unknown;
    if (!record(report)) throw new Error('invalid report');
    return report;
  } catch {
    throw new AgentError('DELIVERY_NOT_READY', 'The final video probe returned an invalid report. Render it again before delivery.');
  }
}
async function fileDigest(file: string) {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}
function projectRevision(project: unknown) {
  return createHash('sha256').update(JSON.stringify(project, null, 2) + '\n').digest('hex');
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export type MediaMetadata = CaptureMetadata & { captureFingerprint: string };
export type Job = {
  jobId: string;
  projectId: string;
  revision: string;
  directionRevision?: string;
  inputDigest?: string;
  mode: 'preview' | 'video' | 'capture';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  createdAt: string;
  pid?: number;
  finishedAt?: string;
  error?: string;
  failedArtifacts?: { quality?: string; contactSheet?: string; poster?: string };
  capture?: CaptureResult;
  artifacts?: {
    preview: string;
    storyboard?: string;
    video?: string;
    recording?: string;
    events?: string;
    quality?: string;
    contactSheet?: string;
    poster?: string;
    scenes: { id: string; type: string; output: string }[];
  };
};
export class AgentService {
  constructor(public store: Workspace) {}
  private async executableDirection(id: string) {
    const planned = await this.store.getDirection(id).catch((error: unknown) => {
      if (error instanceof AgentError && error.code === 'DIRECTION_NOT_FOUND') return undefined;
      throw error;
    });
    if (planned?.direction.executionMode === 'plan-only') {
      throw new AgentError('PLAN_ONLY', 'This direction is plan-only. Change executionMode after authorizing capture or rendering.');
    }
    return planned;
  }
  private async updateDirectionCapture(id: string, media: MediaMetadata) {
    const planned = await this.store.getDirection(id).catch((error: unknown) => {
      if (error instanceof AgentError && error.code === 'DIRECTION_NOT_FOUND') return undefined;
      throw error;
    });
    if (!planned || planned.direction.captureFingerprint === media.captureFingerprint) return planned;
    const status = planned.direction.status === 'draft' ? 'draft' : 'stale';
    return this.store.saveDirection(id, planned.directionRevision, {
      ...planned.direction,
      status,
      captureFingerprint: media.captureFingerprint,
      capture: {
        recordingDigest: media.recordingDigest,
        planDigest: media.planDigest,
        viewport: media.viewport,
        devicePixelRatio: media.devicePixelRatio,
        initialRoute: media.initialRoute,
        buildIdentity: media.buildIdentity,
        ...(media.events ? { events: media.events } : {}),
      },
    });
  }
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
  async mediaMetadata(id: string, video: string): Promise<MediaMetadata | undefined> {
    if (!video) return undefined;
    const file = await this.store.safe(`projects/${id}/public/${video}.json`);
    return JSON.parse(await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return 'null';
      throw error;
    })) ?? undefined;
  }
  async importMedia(id: string, expectedRevision: string, source: string, context?: { plan: z.infer<typeof capturePlanSchema>; initialRoute: string; buildIdentity?: string; devicePixelRatio?: number; events?: CaptureResult['events'] }) {
    const ext = path.extname(source).toLowerCase();
    if (!['.mp4', '.webm'].includes(ext)) throw new AgentError('INVALID_MEDIA', 'Use an MP4 or WebM recording.');
    const input = await this.store.safe(source);
    if (!(await stat(input)).isFile()) throw new AgentError('INVALID_MEDIA', 'Source must be a regular video file.');
    const lock = await this.store.safe(`projects/${id}/.write-lock`);
    await mkdir(lock).catch((e: NodeJS.ErrnoException) => { if (e.code === 'EEXIST') throw new AgentError('PROJECT_BUSY', 'Another writer is saving this project. Read it again before retrying.'); throw e; });
    let copied: string | undefined;
    let sidecar: string | undefined;
    try {
      const current = await this.store.get(id);
      if (current.revision !== expectedRevision) throw new AgentError('REVISION_CONFLICT', 'The project has changed. Read it again and reconcile your edits.');
      const relative = `captures/${randomUUID()}${ext}`;
      await mkdir(await this.store.safe(`projects/${id}/public/captures`), { recursive: true });
      copied = await this.store.safe(`projects/${id}/public/${relative}`);
      await copyFile(input, copied);
      const actual = await probe(copied);
      const capture: CaptureMetadata = {
        recordingDigest: await fileDigest(copied),
        planDigest: digest(context?.plan ?? { operation: 'import_media' }),
        viewport: { width: actual.width, height: actual.height },
        devicePixelRatio: context?.devicePixelRatio ?? 1,
        initialRoute: context?.initialRoute ?? 'local-import',
        buildIdentity: context?.buildIdentity ?? 'unknown',
        ...(context?.events ? {
          events: context.events.map((event) => {
            const holdMs = context.plan.steps.find((step) => step.id === event.id)?.holdMs ?? 200;
            return {
              markId: event.id,
              timestamp: event.verified ? event.end : event.at,
              settledUntil: event.end + holdMs / 1000,
              ...(event.box ? { rect: event.box } : {}),
              ...(event.boxAt !== undefined ? { rectTimestamp: event.boxAt } : {}),
              verified: event.verified === true,
            };
          }),
        } : {}),
      };
      const media: MediaMetadata = { ...capture, captureFingerprint: captureFingerprint(capture) };
      sidecar = `${copied}.json`;
      await atomicJson(sidecar, media);
      const project = validate({ ...current.project, video: relative, sourceDuration: actual.duration, trimBefore: 0, viewport: { width: actual.width, height: actual.height } });
      await this.store.commit(id, current.revision, current.project, project);
      copied = undefined;
      sidecar = undefined;
      const saved = { ...await this.store.get(id), media };
      const direction = await this.updateDirectionCapture(id, media).catch((error: unknown) => ({ warning: `Recording imported, but Director state could not be marked stale: ${error instanceof Error ? error.message : String(error)}` }));
      return { ...saved, ...(direction ? { direction } : {}) };
    } finally { if (copied) await rm(copied, { force: true }); if (sidecar) await rm(sidecar, { force: true }); await rm(lock, { recursive: true, force: true }); }
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
  async compileDirector(id: string, expectedDirectionRevision: string, expectedProjectRevision: string) {
    const projectLock = await this.store.safe(`projects/${id}/.write-lock`);
    const directionLock = await this.store.safe(`projects/${id}/.direction-lock`);
    await mkdir(projectLock).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') throw new AgentError('PROJECT_BUSY', 'Another writer is saving this project. Read both revisions before retrying.');
      throw error;
    });
    let directionLocked = false;
    try {
      await mkdir(directionLock).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'EEXIST') throw new AgentError('PROJECT_BUSY', 'Another writer is saving Director state. Read both revisions before retrying.');
        throw error;
      });
      directionLocked = true;
      const current = await this.store.get(id);
      const planned = await this.store.getDirection(id);
      if (current.revision !== expectedProjectRevision) throw new AgentError('REVISION_CONFLICT', 'The project changed before compilation. Read it again and reconcile the edit.');
      if (planned.directionRevision !== expectedDirectionRevision) throw new AgentError('DIRECTION_REVISION_CONFLICT', 'The direction changed before compilation. Read it again and reconcile the edit.');
      if (planned.direction.captureFingerprint) {
        const media = await this.mediaMetadata(id, current.project.video);
        if (!media || media.captureFingerprint !== planned.direction.captureFingerprint) throw new AgentError('STALE_CAPTURE', 'The reviewed direction references a different or legacy recording. Update and review the direction before compiling.');
      }
      let compiled;
      try { compiled = compileDirection(planned.direction, current.project); }
      catch (error) { throw new AgentError('INVALID_DIRECTION', error instanceof Error ? error.message : String(error)); }
      const nextProjectRevision = projectRevision(compiled.project);
      const nextDirection = { ...compiled.direction, status: 'compiled' as const, compiledProjectRevision: nextProjectRevision };
      await this.store.commit(id, current.revision, current.project, compiled.project);
      try {
        await this.store.commitDirection(id, planned.directionRevision, planned.direction, nextDirection);
      } catch (error) {
        await atomicJson(await this.store.safe(`projects/${id}/project.json`), current.project);
        throw error;
      }
      return {
        project: await this.store.get(id),
        direction: await this.store.getDirection(id),
        compiledDuration: compiled.duration,
      };
    } finally {
      if (directionLocked) await rm(directionLock, { recursive: true, force: true });
      await rm(projectLock, { recursive: true, force: true });
    }
  }
  async deliverDirection(id: string, expectedDirectionRevision: string, expectedProjectRevision: string, jobId: string) {
    const job = await this.getJob(jobId);
    if (job.projectId !== id) throw new AgentError('WRONG_PROJECT', 'The final render belongs to a different project.');
    if (job.mode !== 'video' || job.status !== 'succeeded' || !job.artifacts?.video || !job.artifacts.quality || !job.artifacts.poster || !job.artifacts.contactSheet || !job.artifacts.storyboard || !job.artifacts.preview || !Array.isArray(job.artifacts.scenes) || job.artifacts.scenes.length === 0 || !job.artifacts.scenes.every((scene) => scene && typeof scene.output === 'string' && scene.output)) {
      throw new AgentError('DELIVERY_NOT_READY', 'Choose a successful final-video job with its complete review bundle.');
    }
    if (job.revision !== expectedProjectRevision || job.directionRevision !== expectedDirectionRevision) {
      throw new AgentError('STALE_RENDER', 'The final render does not match the requested compiled project and direction revisions.');
    }
    const output = await this.store.safe(`jobs/${jobId}/output`);
    const artifacts = [job.artifacts.video, job.artifacts.quality, job.artifacts.poster, job.artifacts.contactSheet, job.artifacts.storyboard, job.artifacts.preview,
      ...(job.artifacts.recording ? [job.artifacts.recording] : []), ...(job.artifacts.events ? [job.artifacts.events] : []), ...job.artifacts.scenes.map((scene) => scene.output)];
    for (const artifact of artifacts) {
      const file = await this.store.safe(path.relative(this.store.root, artifact));
      const relative = path.relative(output, file);
      if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new AgentError('INVALID_PATH', 'Delivery artifacts must belong to the selected render job.');
      const info = await stat(file).catch(() => { throw new AgentError('DELIVERY_NOT_READY', 'A required delivery artifact is missing.'); });
      if (!info.isFile() || info.size === 0) throw new AgentError('DELIVERY_NOT_READY', 'Every required delivery artifact must be a nonempty file.');
    }
    let quality: unknown;
    try { quality = JSON.parse(await readFile(job.artifacts.quality, 'utf8')) as unknown; }
    catch { throw new AgentError('DELIVERY_NOT_READY', 'The final quality report is unreadable.'); }
    if (!record(quality)) throw new AgentError('DELIVERY_NOT_READY', 'The final quality report is invalid.');
    const projectReport = record(quality.project) ? quality.project : {};
    const probedMedia = await probeFinalVideo(job.artifacts.video);
    const format = record(probedMedia.format) ? probedMedia.format : {};
    const streams = Array.isArray(probedMedia.streams) ? probedMedia.streams.filter(record) : [];
    const video = streams.find((stream) => stream.codec_type === 'video');
    const expectedDuration = Number(projectReport.durationInFrames) / Number(projectReport.fps);
    const actualDuration = Number(format.duration);
    const validMedia = video?.codec_name === 'h264' && video.width === 1920 && video.height === 1080 && video.pix_fmt === 'yuv420p' && video.r_frame_rate === '30/1'
      && !streams.some((stream) => stream.codec_type === 'audio')
      && Number.isFinite(expectedDuration) && Number.isFinite(actualDuration) && Math.abs(expectedDuration - actualDuration) <= 0.1;
    if (quality.status !== 'passed' || quality.strict !== true || !validMedia) {
      throw new AgentError('DELIVERY_NOT_READY', 'The final render must pass strict quality and the silent H.264 1080p media contract before delivery.');
    }
    const projectLock = await this.store.safe(`projects/${id}/.write-lock`);
    const directionLock = await this.store.safe(`projects/${id}/.direction-lock`);
    await mkdir(projectLock).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') throw new AgentError('PROJECT_BUSY', 'Another writer is saving this project. Read both revisions before retrying delivery.');
      throw error;
    });
    let directionLocked = false;
    try {
      await mkdir(directionLock).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'EEXIST') throw new AgentError('PROJECT_BUSY', 'Another writer is saving Director state. Read both revisions before retrying delivery.');
        throw error;
      });
      directionLocked = true;
      const project = await this.store.get(id);
      const planned = await this.store.getDirection(id);
      if (project.revision !== expectedProjectRevision) throw new AgentError('REVISION_CONFLICT', 'The project changed after the final render. Keep the artifact, but render the current project before delivery.');
      if (planned.directionRevision !== expectedDirectionRevision) throw new AgentError('DIRECTION_REVISION_CONFLICT', 'The direction changed after the final render. Keep the artifact, but render the current direction before delivery.');
      if (planned.direction.status !== 'compiled' || planned.direction.compiledProjectRevision !== project.revision) {
        throw new AgentError('INVALID_DIRECTION', 'Only the matching compiled direction can transition to delivered.');
      }
      await this.store.commitDirection(id, planned.directionRevision, planned.direction, { ...planned.direction, status: 'delivered' });
      return { ...await this.store.getDirection(id), delivery: { jobId, artifacts: job.artifacts } };
    } finally {
      if (directionLocked) await rm(directionLock, { recursive: true, force: true });
      await rm(projectLock, { recursive: true, force: true });
    }
  }
  async prepareScenePackets(id: string, expectedDirectionRevision: string, expectedProjectRevision: string) {
    const project = await this.store.get(id);
    const planned = await this.store.getDirection(id);
    if (project.revision !== expectedProjectRevision) throw new AgentError('REVISION_CONFLICT', 'The project changed. Read it again before preparing scene packets.');
    if (planned.directionRevision !== expectedDirectionRevision) throw new AgentError('DIRECTION_REVISION_CONFLICT', 'The direction changed. Read it again before preparing scene packets.');
    if (!['reviewed', 'compiled'].includes(planned.direction.status)) throw new AgentError('INVALID_DIRECTION', 'Review the direction before preparing scene packets.');
    const packets = scenePackets(planned.direction, planned.directionRevision, project.revision);
    const dir = await this.store.safe(`projects/${id}/direction/scene-packets/${planned.directionRevision}`);
    await mkdir(dir, { recursive: true });
    const artifacts = [];
    for (const packet of packets) {
      const file = path.join(dir, `${packet.sceneId}.json`);
      const serialized = JSON.stringify(packet, null, 2) + '\n';
      const existing = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (existing !== undefined && existing !== serialized) throw new AgentError('PACKET_CONFLICT', `Immutable scene packet ${packet.sceneId} was modified on disk.`);
      if (existing === undefined) await writeFile(file, serialized, { flag: 'wx' });
      artifacts.push({ sceneId: packet.sceneId, path: file, output: packet.output });
    }
    return { projectId: id, directionRevision: planned.directionRevision, projectRevision: project.revision, packets: artifacts };
  }
  async mergeSceneDraftFiles(id: string, expectedDirectionRevision: string, expectedProjectRevision: string) {
    const project = await this.store.get(id);
    const planned = await this.store.getDirection(id);
    if (project.revision !== expectedProjectRevision) throw new AgentError('REVISION_CONFLICT', 'The project changed. Discard stale scene drafts and prepare new packets.');
    if (planned.directionRevision !== expectedDirectionRevision) throw new AgentError('DIRECTION_REVISION_CONFLICT', 'The direction changed. Discard stale scene drafts and prepare new packets.');
    const drafts = [];
    for (const entry of planned.direction.scenes) {
      const file = await this.store.safe(`projects/${id}/direction/scene-drafts/${planned.directionRevision}/${entry.scene.id}.json`);
      drafts.push(JSON.parse(await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') throw new AgentError('DRAFT_MISSING', `Scene ${entry.scene.id} has no draft for direction revision ${planned.directionRevision}.`);
        throw error;
      })));
    }
    let merged;
    try { merged = mergeSceneDrafts(planned.direction, planned.directionRevision, project.revision, drafts); }
    catch (error) { throw new AgentError('INVALID_SCENE_DRAFT', error instanceof Error ? error.message : String(error)); }
    try {
      compileDirection({ ...merged, status: 'reviewed', reviewedBy: planned.direction.reviewedBy ?? 'director', reviewedAt: new Date().toISOString() }, project.project);
    } catch (error) {
      throw new AgentError('INVALID_SCENE_DRAFT', error instanceof Error ? error.message : String(error));
    }
    const saved = await this.store.saveDirection(id, planned.directionRevision, merged);
    return { ...saved, mergedSceneCount: drafts.length, requiresReview: true };
  }
  private async matchingJob(projectId: string, inputDigest: string) {
    const jobs = (await this.listJobs(projectId, 10000)).jobs;
    for (const job of jobs) if (job.inputDigest === inputDigest && ['queued', 'running'].includes(job.status)) return job;
    return undefined;
  }
  private async reserveJob<T>(projectId: string, inputDigest: string, create: () => Promise<T>): Promise<{ reused: true; job: Job } | { reused: false; value: T }> {
    const immediate = await this.matchingJob(projectId, inputDigest);
    if (immediate) return { reused: true, job: immediate };
    const locks = await this.store.safe('.job-locks');
    await mkdir(locks, { recursive: true });
    const lock = path.join(locks, inputDigest);
    let acquired = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await mkdir(lock);
        acquired = true;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const matching = await this.matchingJob(projectId, inputDigest);
        if (matching) return { reused: true, job: matching };
        const info = await stat(lock).catch((statError: NodeJS.ErrnoException) => {
          if (statError.code === 'ENOENT') return undefined;
          throw statError;
        });
        if (!info) continue;
        const age = Date.now() - info.mtimeMs;
        if (age > 5 * 60 * 1000) await rm(lock, { recursive: true, force: true });
        else await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    if (!acquired) throw new AgentError('JOB_BUSY', 'Another matching job is being prepared. Recover it with list_jobs and retry.');
    try {
      const matching = await this.matchingJob(projectId, inputDigest);
      if (matching) return { reused: true, job: matching };
      return { reused: false, value: await create() };
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  async startRender(id: string, expectedRevision: string, mode: 'preview' | 'video') {
    const saved = await this.store.get(id);
    if (saved.revision !== expectedRevision) throw new AgentError('REVISION_CONFLICT', 'The project has changed. Read it again before rendering.');
    const planned = await this.executableDirection(id);
    const current = await this.actualProject(id);
    if (current.revision !== expectedRevision) throw new AgentError('REVISION_CONFLICT', 'The project has changed. Read it again before rendering.');
    await access(path.join(studioDir, 'node_modules/@remotion/renderer')).catch(() => { throw new AgentError('STUDIO_NOT_INSTALLED', 'Run npm run studio:install in the Democena checkout, then install Chromium with npx playwright install chromium.'); });
    const directionRevision = planned && planned.direction.compiledProjectRevision === current.revision && ['compiled', 'delivered'].includes(planned.direction.status)
      ? planned.directionRevision
      : undefined;
    const inputDigest = digest({ operation: 'render', mode, projectRevision: current.revision, directionRevision });
    const reserved = await this.reserveJob(id, inputDigest, async () => {
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
      if (directionRevision && planned) await atomicJson(path.join(dir, 'direction.json'), planned.direction);
      const job: Job = { jobId, projectId: id, revision: current.revision, ...(directionRevision ? { directionRevision } : {}), inputDigest, mode, status: 'queued', createdAt: new Date().toISOString() };
      await atomicJson(path.join(dir, 'job.json'), job);
      await this.launchWorker(job, dir);
      return job;
    });
    if (reserved.reused) return { ...reserved.job, reused: true, next: 'Resume polling this matching nonterminal job instead of starting a duplicate.' };
    const next = mode === 'preview'
      ? 'Poll get_job; after success, inspect read_preview before requesting the final video.'
      : directionRevision
        ? 'Poll get_job; after success, inspect the final review bundle, then call deliver_direction with this job ID and the compiled revisions.'
        : 'Poll get_job; after success, inspect the final local artifacts.';
    return { ...reserved.value, next };
  }
  async startCapture(id: string, expectedRevision: string, plan: z.infer<typeof capturePlanSchema>) {
    const current = await this.store.get(id);
    if (current.revision !== expectedRevision) throw new AgentError('REVISION_CONFLICT', 'Read the project again before capturing.');
    await this.executableDirection(id);
    if (plan.storageState) await access(await this.store.safe(plan.storageState));
    const inputDigest = digest({ operation: 'capture', projectRevision: current.revision, plan });
    const reserved = await this.reserveJob(id, inputDigest, async () => {
      const jobId = randomUUID();
      const dir = await this.store.safe(`jobs/${jobId}`);
      await mkdir(dir);
      await atomicJson(path.join(dir, 'capture-plan.json'), plan);
      const job: Job = { jobId, projectId: id, revision: current.revision, inputDigest, mode: 'capture', status: 'queued', createdAt: new Date().toISOString() };
      await atomicJson(path.join(dir, 'job.json'), job);
      await this.launchWorker(job, dir);
      return job;
    });
    if (reserved.reused) return { ...reserved.job, reused: true, next: 'Resume polling this matching nonterminal capture instead of starting a duplicate.' };
    return { ...reserved.value, next: 'Poll get_job, inspect capture marks with read_preview, then use_capture with the current project revision.' };
  }
  async useCapture(id: string, expectedRevision: string, jobId: string, allowCrossProjectReuse = false) {
    await this.executableDirection(id);
    const job = await this.getJob(jobId);
    if (job.mode !== 'capture' || job.status !== 'succeeded' || !job.capture || !job.artifacts?.recording) throw new AgentError('CAPTURE_NOT_READY', 'Choose a successfully completed capture job.');
    if (job.projectId !== id && !allowCrossProjectReuse) throw new AgentError('WRONG_PROJECT', 'This capture belongs to a different project. Set allowCrossProjectReuse only when intentionally creating another variant from the same take.');
    const plan = JSON.parse(await readFile(await this.store.safe(`jobs/${jobId}/capture-plan.json`), 'utf8')) as z.infer<typeof capturePlanSchema>;
    const saved = await this.importMedia(id, expectedRevision, path.relative(this.store.root, job.artifacts.recording), { plan, initialRoute: plan.url, buildIdentity: plan.buildIdentity, devicePixelRatio: 1, events: job.capture.events });
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
    const extension = path.extname(file).toLowerCase();
    if (!file.startsWith(allowed) || !['.png', '.jpg', '.jpeg'].includes(extension)) throw new AgentError('INVALID_PATH', 'Review image must belong to this job and be PNG or JPEG.');
    if ((await stat(file)).size > 16 * 1024 * 1024) throw new AgentError('IMAGE_TOO_LARGE', 'Preview exceeds 16 MiB; inspect the local artifact instead.');
    return { jobId, sceneId, path: file, mimeType: extension === '.png' ? 'image/png' : 'image/jpeg', data: (await readFile(file)).toString('base64') };
  }
  async call(name: Operation, value: unknown): Promise<Record<string, unknown>> {
    switch (name) {
      case 'capabilities': inputs.capabilities.parse(value); return capabilities();
      case 'list_projects': inputs.list_projects.parse(value); return this.store.list();
      case 'list_jobs': { const a = inputs.list_jobs.parse(value); return this.listJobs(a.projectId, a.limit); }
      case 'create_project': { const a = inputs.create_project.parse(value); return this.store.create(a.projectId, a.title, a.accent, a.branding, a.appearance); }
      case 'get_project': { const a = inputs.get_project.parse(value); return this.store.get(a.projectId); }
      case 'get_direction': { const a = inputs.get_direction.parse(value); return this.store.getDirection(a.projectId); }
      case 'save_direction': { const a = inputs.save_direction.parse(value); return this.store.saveDirection(a.projectId, a.expectedDirectionRevision, a.direction); }
      case 'compile_direction': { const a = inputs.compile_direction.parse(value); return this.compileDirector(a.projectId, a.expectedDirectionRevision, a.expectedProjectRevision); }
      case 'deliver_direction': { const a = inputs.deliver_direction.parse(value); return this.deliverDirection(a.projectId, a.expectedDirectionRevision, a.expectedProjectRevision, a.jobId); }
      case 'prepare_scene_packets': { const a = inputs.prepare_scene_packets.parse(value); return this.prepareScenePackets(a.projectId, a.expectedDirectionRevision, a.expectedProjectRevision); }
      case 'merge_scene_drafts': { const a = inputs.merge_scene_drafts.parse(value); return this.mergeSceneDraftFiles(a.projectId, a.expectedDirectionRevision, a.expectedProjectRevision); }
      case 'save_project': { const a = inputs.save_project.parse(value); return this.store.save(a.projectId, a.expectedRevision, a.project); }
      case 'import_media': { const a = inputs.import_media.parse(value); return this.importMedia(a.projectId, a.expectedRevision, a.source); }
      case 'import_brand_logo': { const a = inputs.import_brand_logo.parse(value); return this.importBrandLogo(a.projectId, a.expectedRevision, a.source); }
      case 'start_capture': { const a = inputs.start_capture.parse(value); return this.startCapture(a.projectId, a.expectedRevision, a.plan); }
      case 'use_capture': { const a = inputs.use_capture.parse(value); return this.useCapture(a.projectId, a.expectedRevision, a.jobId, a.allowCrossProjectReuse); }
      case 'validate_project': { const a = inputs.validate_project.parse(value); const p = await this.actualProject(a.projectId); return { projectId: p.projectId, revision: p.revision, valid: true, ...describeProject(p.project) }; }
      case 'start_render': { const a = inputs.start_render.parse(value); return this.startRender(a.projectId, a.expectedRevision, a.mode); }
      case 'get_job': { const a = inputs.get_job.parse(value); return this.getJob(a.jobId) as unknown as Record<string, unknown>; }
      case 'read_preview': { const a = inputs.read_preview.parse(value); return this.preview(a.jobId, a.sceneId); }
    }
  }
}
