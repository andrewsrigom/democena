import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildTimeline, FPS, prepareProject } from '../../studio/src/timeline.js';
import { motionRecipeFor } from '../../studio/src/motion-recipes.js';
import { rectSchema, sceneSchema, type ProjectInput, type SceneInput } from './schema.js';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const captureEvidenceSchema = z.strictObject({
  kind: z.literal('capture'),
  timestamp: z.number().nonnegative(),
  markId: z.string().min(1).optional(),
  rect: rectSchema.optional(),
  verified: z.boolean().default(false),
});
const authoredEvidenceSchema = z.strictObject({
  kind: z.literal('authored-copy'),
  claim: z.string().min(1).max(500),
});
const captureEventSchema = z.strictObject({
  markId: z.string().min(1),
  timestamp: z.number().nonnegative(),
  settledUntil: z.number().nonnegative(),
  rect: rectSchema.optional(),
  verified: z.boolean(),
}).refine((event) => event.settledUntil >= event.timestamp, {
  path: ['settledUntil'],
  message: 'A capture event cannot settle before it starts.',
});
const directionSceneSchema = z.strictObject({
  narrativeRole: z.enum(['hook', 'chapter', 'product-reveal', 'product-moment', 'explanation', 'verified-result', 'closing']),
  reason: z.string().min(1).max(500),
  transitionPreset: z.enum(['hard-cut', 'soft-crossfade', 'clean-slide', 'rise-cover', 'drop-cover', 'restrained-zoom']).optional(),
  expectedSettledAt: z.number().nonnegative(),
  evidence: z.array(z.discriminatedUnion('kind', [captureEvidenceSchema, authoredEvidenceSchema])).min(1),
  scene: sceneSchema,
});

export const directionSchema = z.strictObject({
  version: z.literal(1),
  status: z.enum(['draft', 'reviewed', 'compiled', 'stale', 'diverged', 'delivered']),
  executionMode: z.enum(['plan-only', 'collaborative', 'autonomous']),
  profile: z.enum(['tour', 'launch']),
  tone: z.enum(['polished', 'cinematic', 'app-store', 'deadpan', 'custom']),
  format: z.literal('landscape-1080p'),
  locale: z.string().regex(/^(?:und|[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/),
  audience: z.string().min(1).max(500),
  primaryMessage: z.string().min(1).max(500),
  visualDirection: z.string().min(1).max(1000),
  brandSource: z.enum(['project', 'imported', 'source', 'neutral']),
  authorizedTarget: z.string().max(1000).optional(),
  facts: z.array(z.string().min(1).max(500)).max(50).default([]),
  exclusions: z.array(z.string().min(1).max(500)).max(50).default([]),
  privacy: z.array(z.string().min(1).max(500)).max(50).default([]),
  reviewedBy: z.enum(['user', 'director']).optional(),
  reviewedAt: z.iso.datetime().optional(),
  captureFingerprint: sha256Schema.optional(),
  capture: z.strictObject({
    recordingDigest: sha256Schema,
    planDigest: sha256Schema,
    viewport: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
    devicePixelRatio: z.number().positive(),
    initialRoute: z.string().min(1),
    buildIdentity: z.string().min(1),
    events: z.array(captureEventSchema).max(500).optional(),
  }).optional(),
  compiledProjectRevision: sha256Schema.optional(),
  poster: z.strictObject({ sceneId: z.string().min(1), sceneLocalTime: z.number().nonnegative() }).optional(),
  scenes: z.array(directionSceneSchema).min(1).max(100),
}).superRefine((direction, ctx) => {
  if (['reviewed', 'compiled', 'delivered'].includes(direction.status) && (!direction.reviewedBy || !direction.reviewedAt)) {
    ctx.addIssue({ code: 'custom', path: ['status'], message: 'Reviewed, compiled and delivered directions require review provenance.' });
  }
  if (['compiled', 'delivered'].includes(direction.status) && !direction.compiledProjectRevision) {
    ctx.addIssue({ code: 'custom', path: ['compiledProjectRevision'], message: 'Compiled and delivered directions require the compiled project revision.' });
  }
  if (direction.capture && direction.captureFingerprint !== captureFingerprint(direction.capture)) {
    ctx.addIssue({ code: 'custom', path: ['captureFingerprint'], message: 'captureFingerprint does not match the canonical capture metadata.' });
  }
  const ids = new Set<string>();
  const captureMarkIds = new Set<string>();
  for (const [index, event] of (direction.capture?.events ?? []).entries()) {
    if (captureMarkIds.has(event.markId)) ctx.addIssue({ code: 'custom', path: ['capture', 'events', index, 'markId'], message: 'Capture event marker IDs must be unique.' });
    captureMarkIds.add(event.markId);
  }
  for (const [index, entry] of direction.scenes.entries()) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.scene.id)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'scene', 'id'], message: 'Director scene IDs use lowercase letters, numbers and hyphens only.' });
    if (ids.has(entry.scene.id)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'scene', 'id'], message: 'Scene IDs must be unique.' });
    ids.add(entry.scene.id);
    if (entry.expectedSettledAt >= entry.scene.duration) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'expectedSettledAt'], message: 'The settled moment must be inside the scene.' });
  }
  if (direction.poster) {
    const selected = direction.scenes.find((entry) => entry.scene.id === direction.poster!.sceneId)?.scene;
    if (!selected || direction.poster.sceneLocalTime >= selected.duration) ctx.addIssue({ code: 'custom', path: ['poster'], message: 'Poster scene and local time must identify a frame inside the direction.' });
  }
});

export type Direction = z.infer<typeof directionSchema>;
export type DirectionScene = z.infer<typeof directionSceneSchema>;
export type CaptureMetadata = NonNullable<Direction['capture']>;

export const sceneDraftSchema = z.strictObject({
  version: z.literal(1),
  sceneId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  baseDirectionRevision: sha256Schema,
  baseProjectRevision: sha256Schema,
  captureFingerprint: sha256Schema.optional(),
  scene: sceneSchema,
});

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digest(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function captureFingerprint(capture: CaptureMetadata) {
  return digest(capture);
}

function rectKey(rect: { x: number; y: number; width: number; height: number }) {
  return [rect.x, rect.y, rect.width, rect.height].map((value) => value.toFixed(3)).join(':');
}

function sourceEvidence(entry: DirectionScene) {
  return entry.evidence.filter((e): e is z.infer<typeof captureEvidenceSchema> => e.kind === 'capture');
}

function hasVerifiedDisplayedResult(entry: DirectionScene, trimBefore: number) {
  if (!('source' in entry.scene)) return false;
  const displayedAt = trimBefore + (entry.scene.type === 'result' && entry.scene.comparison ? entry.scene.comparison.after : entry.scene.source.from);
  return sourceEvidence(entry).some((item) => item.verified && Math.abs(item.timestamp - displayedAt) <= 1 / FPS);
}

function assertBoundCaptureEvidence(direction: Direction, sceneId: string, evidence: z.infer<typeof captureEvidenceSchema>) {
  if (!evidence.markId) {
    if (direction.capture?.events?.length) throw new Error(`Scene ${sceneId} requires a captured marker ID for evidence from an adopted take.`);
    if (evidence.verified) throw new Error(`Scene ${sceneId} marks capture evidence as verified without a captured marker ID.`);
    return;
  }
  const captured = direction.capture?.events?.find((event) => event.markId === evidence.markId);
  if (!captured) throw new Error(`Scene ${sceneId} references capture marker ${evidence.markId} outside the adopted take.`);
  if (evidence.timestamp < captured.timestamp - 1 / FPS || evidence.timestamp > captured.settledUntil + 1 / FPS) {
    throw new Error(`Scene ${sceneId} uses a timestamp outside capture marker ${evidence.markId}.`);
  }
  if (evidence.rect && (!captured.rect || rectKey(evidence.rect) !== rectKey(captured.rect))) {
    throw new Error(`Scene ${sceneId} uses a rectangle that does not match capture marker ${evidence.markId}.`);
  }
  if (evidence.verified && !captured.verified) throw new Error(`Scene ${sceneId} cites capture marker ${evidence.markId} as verified, but the adopted take did not verify it.`);
}

function requiredTimestamps(scene: SceneInput, trimBefore: number) {
  if (!('source' in scene)) return [];
  const values = [trimBefore + scene.source.from];
  if (scene.type === 'result' && scene.comparison) values.push(trimBefore + scene.comparison.before, trimBefore + scene.comparison.after);
  return [...new Set(values)];
}

function requiredRectangles(scene: SceneInput, trimBefore: number) {
  const values: Array<{ rect: { x: number; y: number; width: number; height: number }; timestamp: number }> = [];
  if (!('source' in scene)) return values;
  const sourceStart = trimBefore + scene.source.from;
  if ('focus' in scene && scene.focus) values.push({ rect: scene.focus, timestamp: sourceStart });
  if (scene.type === 'camera') for (const stop of scene.path) if (stop.focus) values.push({ rect: stop.focus, timestamp: sourceStart + (scene.source.freeze ? 0 : stop.at) });
  if (scene.type === 'result' && scene.comparison) {
    values.push({ rect: scene.comparison.crop, timestamp: trimBefore + scene.comparison.before });
    values.push({ rect: scene.comparison.crop, timestamp: trimBefore + scene.comparison.after });
  }
  return values;
}

function applyTransition(entry: DirectionScene, index: number, profile: Direction['profile']): SceneInput {
  if (entry.scene.transition) return entry.scene;
  const preset = entry.transitionPreset ?? (index === 0 ? 'hard-cut' : profile === 'launch' ? 'soft-crossfade' : 'soft-crossfade');
  const transition = preset === 'hard-cut'
    ? { type: 'none' as const, duration: 0 }
    : preset === 'clean-slide'
      ? { type: 'slide' as const, duration: profile === 'launch' ? 0.35 : 0.45 }
      : preset === 'rise-cover'
        ? { type: 'slide-up' as const, duration: profile === 'launch' ? 0.4 : 0.55 }
        : preset === 'drop-cover'
          ? { type: 'slide-down' as const, duration: profile === 'launch' ? 0.4 : 0.55 }
      : { type: 'fade' as const, duration: profile === 'launch' ? 0.3 : 0.4 };
  return { ...entry.scene, transition } as SceneInput;
}

export function compileDirection(directionValue: unknown, currentProject: ProjectInput) {
  const direction = directionSchema.parse(directionValue);
  if (direction.status !== 'reviewed') throw new Error('Direction must be reviewed before compilation.');
  const appEntries = direction.scenes.filter((entry) => !['text', 'chapter', 'outro'].includes(entry.scene.type));
  if (appEntries.length > 0) {
    if (!direction.capture || !direction.captureFingerprint) throw new Error('Application scenes require compatible capture metadata.');
    if (direction.capture.viewport.width !== currentProject.viewport.width || direction.capture.viewport.height !== currentProject.viewport.height) throw new Error('Direction capture viewport does not match the project recording.');
  }
  for (const entry of appEntries) {
    const evidence = sourceEvidence(entry);
    if (evidence.length === 0) throw new Error(`Scene ${entry.scene.id} requires capture evidence.`);
    for (const item of evidence) assertBoundCaptureEvidence(direction, entry.scene.id, item);
    for (const timestamp of requiredTimestamps(entry.scene, currentProject.trimBefore)) {
      if (!evidence.some((item) => Math.abs(item.timestamp - timestamp) <= 1 / FPS)) throw new Error(`Scene ${entry.scene.id} uses timestamp ${timestamp} without approved capture evidence.`);
    }
    for (const requirement of requiredRectangles(entry.scene, currentProject.trimBefore)) {
      if (!evidence.some((item) => item.rect && rectKey(item.rect) === rectKey(requirement.rect) && Math.abs(item.timestamp - requirement.timestamp) <= 1 / FPS)) {
        throw new Error(`Scene ${entry.scene.id} uses a rectangle outside its approved evidence at displayed capture time ${requirement.timestamp}.`);
      }
    }
  }
  const scenes = direction.scenes.map((entry, index) => applyTransition(entry, index, direction.profile));
  const project = prepareProject({ ...currentProject, scenes }) as unknown as ProjectInput;
  const duration = buildTimeline(project.scenes, FPS).at(-1)!.end / FPS;
  if (direction.profile === 'tour' && appEntries.length > 0) {
    if (!direction.scenes.some((entry) => ['product-reveal', 'product-moment'].includes(entry.narrativeRole) && !['text', 'chapter', 'outro'].includes(entry.scene.type))) throw new Error('A product tour requires a real product moment.');
    if (!direction.scenes.some((entry) => entry.narrativeRole === 'verified-result' && hasVerifiedDisplayedResult(entry, currentProject.trimBefore))) throw new Error('A product tour requires a verified result displayed from its verified capture evidence.');
  }
  if (direction.profile === 'launch') {
    if (scenes.length < 4 || scenes.length > 6) throw new Error('Launch directions require four to six scenes.');
    if (duration < 15 || duration > 25) throw new Error(`Launch duration must be 15-25 seconds; compiled duration is ${duration.toFixed(2)} seconds.`);
    if (direction.scenes[0]?.narrativeRole !== 'hook') throw new Error('A launch direction must begin with a hook.');
    if (!direction.scenes.some((entry) => ['product-reveal', 'product-moment'].includes(entry.narrativeRole) && !['text', 'chapter', 'outro'].includes(entry.scene.type))) throw new Error('A launch direction requires a real product moment.');
    if (!direction.scenes.some((entry) => entry.narrativeRole === 'verified-result' && hasVerifiedDisplayedResult(entry, currentProject.trimBefore))) throw new Error('A launch direction requires a verified result displayed from its verified capture evidence.');
    if (direction.scenes.at(-1)?.narrativeRole !== 'closing') throw new Error('A launch direction must end with a closing scene.');
  }
  return { direction, project, duration };
}

export function renderBrief(directionValue: unknown) {
  const d = directionSchema.parse(directionValue);
  return `# ${d.profile === 'launch' ? 'Launch' : 'Tour'} brief\n\n- **Audience:** ${d.audience}\n- **Primary message:** ${d.primaryMessage}\n- **Profile:** ${d.profile}\n- **Format:** ${d.format}\n- **Locale:** ${d.locale}\n- **Tone:** ${d.tone}\n- **Execution mode:** ${d.executionMode}\n- **Brand source:** ${d.brandSource}\n- **Audio:** silent; no audio stream\n${d.authorizedTarget ? `- **Authorized target:** ${d.authorizedTarget}\n` : ''}\n## Visual direction\n\n${d.visualDirection}\n\n## Facts\n\n${d.facts.length ? d.facts.map((fact) => `- ${fact}`).join('\n') : '- None recorded.'}\n\n## Exclusions and privacy\n\n${[...d.exclusions, ...d.privacy].length ? [...d.exclusions, ...d.privacy].map((item) => `- ${item}`).join('\n') : '- No additional constraints recorded.'}\n`;
}

export function renderStoryboard(directionValue: unknown) {
  const d = directionSchema.parse(directionValue);
  const rows = d.scenes.map((entry, index) => {
    const evidence = entry.evidence.map((item) => item.kind === 'capture' ? `capture @ ${item.timestamp.toFixed(2)}s${item.markId ? ` (${item.markId})` : ''}${item.verified ? ' verified' : ''}` : `authored: ${item.claim}`).join('; ');
    return `## ${String(index + 1).padStart(2, '0')} — ${entry.scene.id}\n\n- **Role:** ${entry.narrativeRole}\n- **Reason:** ${entry.reason}\n- **Type:** ${entry.scene.type}\n- **Motion recipe:** ${motionRecipeFor(entry.scene) ?? 'standard scene motion'}\n- **Duration:** ${entry.scene.duration.toFixed(2)}s\n- **Settled preview:** ${entry.expectedSettledAt.toFixed(2)}s\n- **Title:** ${entry.scene.title.replaceAll('\n', ' / ')}\n- **Evidence:** ${evidence}\n`;
  });
  return `# Storyboard\n\nProfile: **${d.profile}** · Tone: **${d.tone}** · Status: **${d.status}**\n\n${rows.join('\n')}\n`;
}

export function scenePackets(directionValue: unknown, directionRevision: string, projectRevision: string) {
  const direction = directionSchema.parse(directionValue);
  return direction.scenes.map((entry) => ({
    version: 1,
    sceneId: entry.scene.id,
    baseDirectionRevision: directionRevision,
    baseProjectRevision: projectRevision,
    captureFingerprint: direction.captureFingerprint,
    profile: direction.profile,
    tone: direction.tone,
    narrativeRole: entry.narrativeRole,
    reason: entry.reason,
    duration: entry.scene.duration,
    copy: { eyebrow: entry.scene.eyebrow, title: entry.scene.title, body: entry.scene.body },
    captureEvidence: sourceEvidence(entry),
    allowedSceneType: entry.scene.type,
    motionRecipe: motionRecipeFor(entry.scene),
    approvedScene: entry.scene,
    output: `direction/scene-drafts/${directionRevision}/${entry.scene.id}.json`,
  }));
}

function strings(value: unknown, result: string[] = []) {
  if (typeof value === 'string') result.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, result);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, result);
  return result;
}

export function mergeSceneDrafts(directionValue: unknown, directionRevision: string, projectRevision: string, draftValues: unknown[]) {
  const direction = directionSchema.parse(directionValue);
  const drafts = new Map(draftValues.map((value) => {
    const draft = sceneDraftSchema.parse(value);
    if (draft.baseDirectionRevision !== directionRevision) throw new Error(`Draft ${draft.sceneId} was created from a stale direction revision.`);
    if (draft.baseProjectRevision !== projectRevision) throw new Error(`Draft ${draft.sceneId} was created from a stale project revision.`);
    if (draft.captureFingerprint !== direction.captureFingerprint) throw new Error(`Draft ${draft.sceneId} references different capture evidence.`);
    return [draft.sceneId, draft] as const;
  }));
  if (drafts.size !== direction.scenes.length) throw new Error('Provide exactly one draft for every direction scene.');
  const scenes = direction.scenes.map((entry) => {
    const draft = drafts.get(entry.scene.id);
    if (!draft) throw new Error(`Missing draft for scene ${entry.scene.id}.`);
    if (draft.scene.type !== entry.scene.type || draft.scene.duration !== entry.scene.duration) throw new Error(`Draft ${entry.scene.id} changed its approved type or duration.`);
    if (JSON.stringify(strings(draft.scene)) !== JSON.stringify(strings(entry.scene))) throw new Error(`Draft ${entry.scene.id} changed approved copy, claims or identifiers.`);
    return { ...entry, scene: draft.scene };
  });
  const merged = directionSchema.parse({ ...direction, status: 'draft', reviewedBy: undefined, reviewedAt: undefined, compiledProjectRevision: undefined, scenes });
  // Reuse compilation evidence checks without allowing this helper to publish a manifest.
  return merged;
}
