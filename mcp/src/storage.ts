import { mkdir, readFile, writeFile, rename, rm, readdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AgentError, describeProject, idSchema, validate } from './contracts.js';

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
    return { projectId: id, revision: createHash('sha256').update(raw).digest('hex'), ...describeProject(JSON.parse(raw)) };
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
  async create(id: string, title: string, accent: string, branding?: { name?: string; tagline?: string; footer?: string }) {
    const project = validate({ version: 2, title, accent, ...(branding ? { branding } : {}), video: '', sourceDuration: 0, trimBefore: 0, viewport: { width: 1280, height: 800 }, scenes: [{ id: 'opening', type: 'text', duration: 5, eyebrow: '', title, body: '', reveal: 'words' }] });
    const dir = await this.projectDir(id);
    await mkdir(dir).catch((e: NodeJS.ErrnoException) => { if (e.code === 'EEXIST') throw new AgentError('ALREADY_EXISTS', `Project ${id} already exists. Choose another ID.`); throw e; });
    await mkdir(path.join(dir, 'public'));
    await mkdir(path.join(dir, 'revisions'));
    await atomicJson(path.join(dir, 'project.json'), project);
    return this.get(id);
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
