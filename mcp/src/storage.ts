import { mkdir, readFile, writeFile, rename, rm, readdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AgentError, describeProject, idSchema, validate } from './contracts.js';
import { directionSchema, renderBrief, renderStoryboard } from './direction.js';

function revision(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

export async function atomicText(file: string, value: string) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temp, value, { flag: 'wx' }); await rename(temp, file); }
  finally { await rm(temp, { force: true }); }
}

export async function atomicJson(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); await rename(temp, file); }
  finally { await rm(temp, { force: true }); }
}
export class Workspace {
  constructor(public root: string) {}
  static async open(root: string) {
    if (!path.isAbsolute(root)) throw new AgentError('INVALID_WORKSPACE', '--workspace must be an absolute directory path.');
    await mkdir(root, { recursive: true });
    const store = new Workspace(await realpath(root));
    for (const dir of ['projects', 'jobs', 'assets']) await mkdir(await store.safe(dir), { recursive: true });
    return store;
  }
  async safe(relative: string) {
    const target = path.resolve(this.root, relative);
    const rel = path.relative(this.root, target);
    if (path.isAbsolute(relative) || !rel || rel === '..' || rel.startsWith(`..${path.sep}`)) throw new AgentError('INVALID_PATH', 'Path must stay inside the configured workspace.');
    let current = this.root;
    for (const part of rel.split(path.sep)) {
      current = path.join(current, part);
      const info = await lstat(current).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return undefined; throw e; });
      if (info?.isSymbolicLink()) throw new AgentError('INVALID_PATH', 'Workspace paths must not contain symbolic links.');
    }
    return target;
  }
  async projectDir(id: string) { return this.safe(`projects/${idSchema.parse(id)}`); }
  async get(id: string) {
    const file = await this.safe(`projects/${idSchema.parse(id)}/project.json`);
    const raw = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') throw new AgentError('NOT_FOUND', `Project ${id} does not exist.`); throw error; });
    return { projectId: id, revision: revision(raw), ...describeProject(JSON.parse(raw)) };
  }
  async list() {
    const entries = await readdir(await this.safe('projects'), { withFileTypes: true });
    const result = [];
    for (const e of entries.sort((a,b) => a.name.localeCompare(b.name))) if (e.isDirectory() && idSchema.safeParse(e.name).success) {
      const p = await this.get(e.name);
      result.push({ projectId: p.projectId, title: p.project.title, revision: p.revision, sceneCount: p.project.scenes.length });
    }
    return { projects: result };
  }
  async create(id: string, title: string, accent: string, branding?: { name?: string; tagline?: string; footer?: string }, appearance?: {
    surfaceMode?: 'light' | 'dark' | 'auto'; background?: string; foreground?: string; muted?: string;
    surface?: string; border?: string; tint?: string; fontFamily?: string; radius?: number;
  }) {
    const project = validate({ version: 2, title, accent, ...(branding ? { branding } : {}), ...(appearance ? { appearance } : {}), video: '', sourceDuration: 0, trimBefore: 0, viewport: { width: 1280, height: 800 }, scenes: [{ id: 'opening', type: 'text', duration: 5, eyebrow: '', title, body: '', reveal: 'words' }] });
    const dir = await this.projectDir(id);
    await mkdir(dir).catch((e: NodeJS.ErrnoException) => { if (e.code === 'EEXIST') throw new AgentError('ALREADY_EXISTS', `Project ${id} already exists. Choose another ID.`); throw e; });
    await mkdir(path.join(dir, 'public'));
    await mkdir(path.join(dir, 'revisions'));
    await mkdir(path.join(dir, 'direction', 'revisions'), { recursive: true });
    await mkdir(path.join(dir, 'direction', 'scene-packets'), { recursive: true });
    await mkdir(path.join(dir, 'direction', 'scene-drafts'), { recursive: true });
    await atomicJson(path.join(dir, 'project.json'), project);
    return this.get(id);
  }

  private async readCanonicalDirection(id: string) {
    const project = await this.get(id);
    const file = await this.safe(`projects/${idSchema.parse(id)}/direction/direction.json`);
    const raw = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') throw new AgentError('DIRECTION_NOT_FOUND', `Project ${id} has no Director plan yet.`);
      throw error;
    });
    const saved = directionSchema.parse(JSON.parse(raw));
    return { projectId: id, directionRevision: revision(raw), projectRevision: project.revision, saved };
  }

  async getDirection(id: string) {
    const current = await this.readCanonicalDirection(id);
    const { saved } = current;
    const direction = saved.compiledProjectRevision && saved.compiledProjectRevision !== current.projectRevision && ['compiled', 'delivered'].includes(saved.status)
      ? { ...saved, status: 'diverged' as const }
      : saved;
    const { saved: _saved, ...metadata } = current;
    return { ...metadata, direction };
  }

  async saveDirection(id: string, expectedDirectionRevision: string | null, value: unknown) {
    await this.get(id);
    const direction = directionSchema.parse(value);
    if (['compiled', 'delivered', 'diverged'].includes(direction.status)) {
      throw new AgentError('DIRECTION_STATE_MANAGED', 'save_direction accepts draft, reviewed or stale plans. Compiled, delivered and diverged states are managed by the Director workflow.');
    }
    const lock = await this.safe(`projects/${id}/.direction-lock`);
    await mkdir(lock).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') throw new AgentError('PROJECT_BUSY', 'Another writer is saving Director state. Read the direction again before retrying.');
      throw error;
    });
    try {
      const current = await this.readCanonicalDirection(id).catch((error: unknown) => {
        if (error instanceof AgentError && error.code === 'DIRECTION_NOT_FOUND') return undefined;
        throw error;
      });
      if (current ? current.directionRevision !== expectedDirectionRevision : expectedDirectionRevision !== null) {
        throw new AgentError('DIRECTION_REVISION_CONFLICT', 'The direction has changed. Read it again and reconcile your edits. Use null only for the first save.');
      }
      await this.commitDirection(id, current?.directionRevision, current?.saved, direction);
      return this.getDirection(id);
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }

  async commitDirection(id: string, previousRevision: string | undefined, previous: unknown, direction: unknown) {
    const parsed = directionSchema.parse(direction);
    const dir = await this.safe(`projects/${id}/direction`);
    await mkdir(path.join(dir, 'revisions'), { recursive: true });
    if (previousRevision && previous) {
      await writeFile(path.join(dir, 'revisions', `${previousRevision}.json`), JSON.stringify(previous, null, 2) + '\n', { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
    }
    const briefFile = path.join(dir, 'BRIEF.md');
    const storyboardFile = path.join(dir, 'STORYBOARD.md');
    const priorViews = await Promise.all([briefFile, storyboardFile].map((file) => readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    })));
    try {
      await atomicText(briefFile, renderBrief(parsed));
      await atomicText(storyboardFile, renderStoryboard(parsed));
      // The canonical JSON moves last so readers never observe a new revision with old review views.
      await atomicJson(path.join(dir, 'direction.json'), parsed);
    } catch (error) {
      await Promise.all([briefFile, storyboardFile].map((file, index) => priorViews[index] === undefined
        ? rm(file, { force: true })
        : atomicText(file, priorViews[index])));
      throw error;
    }
  }
  async save(id: string, expectedRevision: string, value: unknown) {
    const project = validate(value);
    await this.get(id);
    const lock = await this.safe(`projects/${id}/.write-lock`);
    await mkdir(lock).catch((e: NodeJS.ErrnoException) => { if (e.code === 'EEXIST') throw new AgentError('PROJECT_BUSY', 'Another writer is saving this project. Read the project again before retrying.'); throw e; });
    try {
      const current = await this.get(id);
      if (current.revision !== expectedRevision) throw new AgentError('REVISION_CONFLICT', 'The project has changed. Read it again and reconcile your edits.');
      if (project.video !== current.project.video || project.sourceDuration !== current.project.sourceDuration || JSON.stringify(project.viewport) !== JSON.stringify(current.project.viewport)) throw new AgentError('MEDIA_CHANGE_REQUIRES_IMPORT', 'Use import_media to change video, duration or viewport.');
      if (project.branding?.logo && project.branding.logo !== current.project.branding?.logo) throw new AgentError('BRAND_CHANGE_REQUIRES_IMPORT', 'Use import_brand_logo to add or replace a logo. Remove the logo field to hide an imported logo.');
      await this.commit(id, current.revision, current.project, project);
      return await this.get(id);
    } finally { await rm(lock, { recursive: true, force: true }); }
  }
  async commit(id: string, revision: string, previous: unknown, project: unknown) {
    const backup = await this.safe(`projects/${id}/revisions/${revision}.json`);
    await writeFile(backup, JSON.stringify(previous, null, 2) + '\n', { flag: 'wx' }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
    await atomicJson(await this.safe(`projects/${id}/project.json`), project);
  }
}
