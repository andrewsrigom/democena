import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildTimeline, FPS, prepareProject } from '../../studio/src/timeline.js';
import { motionRecipeFor, motionRecipeVocabulary, transitionForPreset, transitionPresetIds } from '../../studio/src/motion-recipes.js';
import { captionPlacements, chromeModes, compositionLayouts, compositionRegistry, sceneComposition } from '../../studio/src/composition-registry.mjs';
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
  rectTimestamp: z.number().nonnegative().optional(),
  verified: z.boolean(),
}).refine((event) => event.settledUntil >= event.timestamp, {
  path: ['settledUntil'],
  message: 'A capture event cannot settle before it starts.',
});
const directionSceneFields = {
  narrativeRole: z.enum(['hook', 'chapter', 'product-reveal', 'product-moment', 'explanation', 'verified-result', 'closing']),
  reason: z.string().min(1).max(500),
  expectedSettledAt: z.number().nonnegative(),
  evidence: z.array(z.discriminatedUnion('kind', [captureEvidenceSchema, authoredEvidenceSchema])).min(1),
  scene: sceneSchema,
};
const directionSceneV1Schema = z.strictObject({
  ...directionSceneFields,
  transitionPreset: z.enum([...transitionPresetIds, 'restrained-zoom']).optional(),
});

export const storyModeSchema = z.enum(['tour', 'launch', 'spotlight', 'change-story', 'agent-run', 'explainer', 'loop']);
export const motionLanguageSchema = z.enum(['editorial', 'precise', 'kinetic', 'cinematic', 'quiet']);
export const typographicRoleSchema = z.enum(['hero', 'statement', 'metadata', 'proof', 'label', 'silent-product']);
export const transitionIntentSchema = z.enum(['continue', 'advance', 'reveal', 'focus', 'prove', 'contrast', 'close']);
const recipeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
export const beatCompositionSchema = z.strictObject({
  layout: z.enum(compositionLayouts).optional(),
  caption: z.enum(captionPlacements).optional(),
  chrome: z.enum(chromeModes).optional(),
}).superRefine((composition, ctx) => {
  if (composition.caption === 'side' && composition.layout && !['framed', 'detail-crop'].includes(composition.layout)) {
    ctx.addIssue({ code: 'custom', path: ['caption'], message: 'Side captions require the framed or detail-crop layout.' });
  }
});
export const beatConceptSchema = z.strictObject({
  concept: z.string().min(1).max(500),
  focalAction: z.enum(['introduce', 'orient', 'reveal', 'focus', 'explain', 'compare', 'prove', 'close']),
  primarySubject: z.enum(['authored-copy', 'product', 'evidence', 'brand']),
  typographicRole: typographicRoleSchema,
  density: z.enum(['sparse', 'balanced', 'dense']),
  transitionIntent: transitionIntentSchema,
  composition: beatCompositionSchema.optional(),
  recipe: z.strictObject({
    selected: recipeIdSchema.optional(),
    compatible: z.array(recipeIdSchema).min(1).max(20),
    fallback: recipeIdSchema,
  }),
});
const directionSceneSchema = z.strictObject({
  ...directionSceneFields,
  transitionPreset: z.enum(transitionPresetIds).optional(),
  beat: beatConceptSchema,
});

const commonDirectionFields = {
  status: z.enum(['draft', 'reviewed', 'compiled', 'stale', 'diverged', 'delivered']),
  executionMode: z.enum(['plan-only', 'collaborative', 'autonomous']),
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
};

const directionV1Schema = z.strictObject({
  version: z.literal(1),
  ...commonDirectionFields,
  profile: z.enum(['tour', 'launch']),
  scenes: z.array(directionSceneV1Schema).min(1).max(100),
});

const directionV2CoreSchema = z.strictObject({
  version: z.literal(2),
  ...commonDirectionFields,
  storyMode: storyModeSchema,
  motionLanguage: motionLanguageSchema,
  scenes: z.array(directionSceneSchema).min(1).max(100),
});

const recipeById = new Map<string, (typeof motionRecipeVocabulary)[number]>(motionRecipeVocabulary.map((recipe) => [recipe.id, recipe]));
const standardRecipe = 'standard-scene-motion';

const directionV2Schema = directionV2CoreSchema.superRefine((direction, ctx) => {
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
    const recipeIds = [...entry.beat.recipe.compatible, entry.beat.recipe.fallback, ...(entry.beat.recipe.selected ? [entry.beat.recipe.selected] : [])];
    for (const recipeId of new Set(recipeIds)) {
      const recipe = recipeById.get(recipeId);
      if (!recipe) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'recipe'], message: `Unknown motion recipe: ${recipeId}.` });
      if (recipe && !recipe.sceneTypes.includes(entry.scene.type)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'recipe'], message: `Motion recipe ${recipeId} does not support ${entry.scene.type} scenes.` });
    }
    const renderedRecipe = motionRecipeFor(entry.scene) ?? standardRecipe;
    if (!entry.beat.recipe.compatible.includes(renderedRecipe)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'recipe', 'compatible'], message: `The current Project v2 renderer applies ${renderedRecipe}; include it in the compatible recipe shortlist.` });
    if (entry.beat.recipe.selected && entry.beat.recipe.selected !== renderedRecipe) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'recipe', 'selected'], message: `Selected recipe ${entry.beat.recipe.selected} cannot render through Project v2; the current renderer applies ${renderedRecipe}.` });
    if (entry.beat.recipe.selected && !entry.beat.recipe.compatible.includes(entry.beat.recipe.selected)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'recipe', 'selected'], message: 'The selected recipe must appear in the compatible recipe shortlist.' });
    if (!entry.beat.recipe.compatible.includes(entry.beat.recipe.fallback)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'recipe', 'fallback'], message: 'The fallback recipe must appear in the compatible recipe shortlist.' });
    if (entry.beat.typographicRole === 'silent-product' && ['text', 'chapter', 'outro'].includes(entry.scene.type)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'typographicRole'], message: 'silent-product is available only to product scenes.' });
    const composition = entry.beat.composition;
    const productScene = !['text', 'chapter', 'outro'].includes(entry.scene.type);
    const comparisonResult = entry.scene.type === 'result' && entry.scene.comparison !== undefined;
    const presentationScene = productScene && !comparisonResult;
    const scenePresentation = presentationScene && 'presentation' in entry.scene ? entry.scene.presentation : undefined;
    const effectiveLayout = composition?.layout ?? scenePresentation?.layout ?? 'framed';
    const effectiveCaption = entry.beat.typographicRole === 'silent-product' ? 'none' : composition?.caption ?? scenePresentation?.caption ?? compositionRegistry[effectiveLayout].defaultCaption;
    if ((composition && !presentationScene && (composition.layout !== undefined || composition.caption !== undefined)) || (comparisonResult && 'presentation' in entry.scene && entry.scene.presentation !== undefined)) {
      ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'composition'], message: comparisonResult ? 'Comparison result beats cannot select product layouts or captions.' : 'Authored scenes can choose chrome and typography, but product layouts and captions require a product scene.' });
    }
    if (presentationScene && effectiveCaption === 'side' && !['framed', 'detail-crop'].includes(effectiveLayout)) {
      ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'composition'], message: `The effective ${effectiveLayout} layout cannot use a side caption.` });
    }
    if (presentationScene && compositionRegistry[effectiveLayout].requiresFocus && !('focus' in entry.scene && entry.scene.focus)) {
      ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'composition', 'layout'], message: `${effectiveLayout} requires an evidence-linked focus rectangle.` });
    }
    if (presentationScene && entry.scene.type === 'focus' && entry.scene.zoom !== undefined) {
      const minimumZoom = effectiveLayout === 'detail-crop' ? 1.2 : effectiveLayout === 'full-bleed-proof' ? 1.1 : 1;
      if (entry.scene.zoom < minimumZoom) {
        ctx.addIssue({ code: 'custom', path: ['scenes', index, 'scene', 'zoom'], message: `zoom must be at least ${minimumZoom} for the effective ${effectiveLayout} layout.` });
      }
    }
    if (entry.beat.typographicRole === 'silent-product' && ((composition?.caption && composition.caption !== 'none') || (scenePresentation?.caption && scenePresentation.caption !== 'none'))) {
      ctx.addIssue({ code: 'custom', path: ['scenes', index, 'beat', 'composition', 'caption'], message: 'silent-product beats cannot render a caption.' });
    }
    if (entry.scene.typographicRole && entry.scene.typographicRole !== entry.beat.typographicRole) {
      ctx.addIssue({ code: 'custom', path: ['scenes', index, 'scene', 'typographicRole'], message: 'Scene typography must match the canonical beat typographic role.' });
    }
    if (composition?.chrome && entry.scene.chrome && entry.scene.chrome !== composition.chrome) {
      ctx.addIssue({ code: 'custom', path: ['scenes', index, 'scene', 'chrome'], message: 'Scene chrome must match the canonical beat composition choice.' });
    }
    if (composition && 'presentation' in entry.scene && entry.scene.presentation) {
      if (composition.layout && entry.scene.presentation.layout && composition.layout !== entry.scene.presentation.layout) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'scene', 'presentation', 'layout'], message: 'Scene layout must match the canonical beat composition choice.' });
      if (composition.caption && entry.scene.presentation.caption && composition.caption !== entry.scene.presentation.caption) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'scene', 'presentation', 'caption'], message: 'Scene caption must match the canonical beat composition choice.' });
    }
  }
  if (direction.poster) {
    const selected = direction.scenes.find((entry) => entry.scene.id === direction.poster!.sceneId)?.scene;
    if (!selected || direction.poster.sceneLocalTime >= selected.duration) ctx.addIssue({ code: 'custom', path: ['poster'], message: 'Poster scene and local time must identify a frame inside the direction.' });
  }
});

type DirectionV1 = z.infer<typeof directionV1Schema>;

function migratedMotionLanguage(tone: DirectionV1['tone']) {
  if (tone === 'cinematic') return 'cinematic' as const;
  if (tone === 'app-store') return 'kinetic' as const;
  if (tone === 'deadpan') return 'quiet' as const;
  if (tone === 'custom') return 'precise' as const;
  return 'editorial' as const;
}

function migratedBeat(entry: DirectionV1['scenes'][number]) {
  const selected = motionRecipeFor(entry.scene);
  const compatible = [...new Set([...(selected ? [selected] : []), standardRecipe])];
  const role = entry.narrativeRole;
  return {
    concept: entry.reason,
    focalAction: role === 'hook' ? 'introduce' as const
      : role === 'chapter' ? 'orient' as const
        : role === 'product-reveal' ? 'reveal' as const
          : role === 'product-moment' ? 'focus' as const
            : role === 'explanation' ? 'explain' as const
              : role === 'verified-result' ? 'prove' as const
                : 'close' as const,
    primarySubject: ['product-reveal', 'product-moment'].includes(role) ? 'product' as const
      : role === 'verified-result' ? 'evidence' as const
        : role === 'closing' ? 'brand' as const
          : 'authored-copy' as const,
    typographicRole: role === 'hook' ? 'hero' as const
      : role === 'chapter' ? 'label' as const
        : role === 'verified-result' ? 'proof' as const
          : role === 'closing' ? 'statement' as const
            : 'presentation' in entry.scene && entry.scene.presentation?.caption === 'none' ? 'silent-product' as const
              : 'statement' as const,
    density: entry.scene.body.trim() ? 'balanced' as const : 'sparse' as const,
    transitionIntent: role === 'hook' ? 'advance' as const
      : role === 'chapter' || role === 'product-reveal' ? 'reveal' as const
        : role === 'product-moment' ? 'focus' as const
          : role === 'verified-result' ? 'prove' as const
            : role === 'closing' ? 'close' as const
              : 'continue' as const,
    recipe: { ...(selected ? { selected } : {}), compatible, fallback: standardRecipe },
  };
}

function assertRenderedRecipeEvidence(entry: DirectionScene) {
  const recipeId = motionRecipeFor(entry.scene) ?? standardRecipe;
  const recipe = recipeById.get(recipeId);
  if (recipe?.evidence === 'authored-copy' && !entry.evidence.some((item) => item.kind === 'authored-copy')) {
    throw new Error(`Motion recipe ${recipeId} requires authored-copy evidence for scene ${entry.scene.id}.`);
  }
  if (recipe?.evidence === 'capture-rectangle' && !entry.evidence.some((item) => item.kind === 'capture' && item.rect)) {
    throw new Error(`Motion recipe ${recipeId} requires captured rectangle evidence for scene ${entry.scene.id}.`);
  }
}

function migrateDirection(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as { version?: unknown }).version !== 1) return value;
  const result = directionV1Schema.safeParse(value);
  if (!result.success) return value;
  const { profile, scenes, ...direction } = result.data;
  return { ...direction, version: 2, storyMode: profile, motionLanguage: migratedMotionLanguage(direction.tone), scenes: scenes.map((entry) => ({
    ...entry,
    ...(entry.transitionPreset === 'restrained-zoom' ? { transitionPreset: 'soft-crossfade' as const } : {}),
    beat: migratedBeat(entry),
  })) };
}

export const directionSchema = z.preprocess(migrateDirection, directionV2Schema);

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
  if (evidence.rect) {
    if (!captured.rect || rectKey(evidence.rect) !== rectKey(captured.rect)) throw new Error(`Scene ${sceneId} uses a rectangle that does not match capture marker ${evidence.markId}.`);
    if (captured.rectTimestamp === undefined || Math.abs(evidence.timestamp - captured.rectTimestamp) > 1 / FPS) {
      throw new Error(`Scene ${sceneId} uses capture marker ${evidence.markId}'s rectangle outside its measurement time.`);
    }
  }
  if (evidence.verified && !captured.verified) throw new Error(`Scene ${sceneId} cites capture marker ${evidence.markId} as verified, but the adopted take did not verify it.`);
}

function requiredTimestamps(scene: SceneInput, trimBefore: number) {
  if (!('source' in scene)) return [];
  if (scene.type === 'result' && scene.comparison) return [...new Set([trimBefore + scene.comparison.before, trimBefore + scene.comparison.after])];
  return [trimBefore + scene.source.from];
}

function requiredRectangles(scene: SceneInput, trimBefore: number) {
  const values: Array<{ rect: { x: number; y: number; width: number; height: number }; timestamp: number }> = [];
  if (!('source' in scene)) return values;
  if (scene.type === 'result' && scene.comparison) {
    values.push({ rect: scene.comparison.crop, timestamp: trimBefore + scene.comparison.before });
    values.push({ rect: scene.comparison.crop, timestamp: trimBefore + scene.comparison.after });
    return values;
  }
  const sourceStart = trimBefore + scene.source.from;
  if ('focus' in scene && scene.focus) values.push({ rect: scene.focus, timestamp: sourceStart });
  if (scene.type === 'camera') for (const stop of scene.path) if (stop.focus) values.push({ rect: stop.focus, timestamp: sourceStart + (scene.source.freeze ? 0 : stop.at) });
  return values;
}

function applyTransition(entry: DirectionScene, index: number, storyMode: Direction['storyMode']): SceneInput {
  if (entry.scene.transition) return entry.scene;
  const preset = entry.transitionPreset ?? (index === 0 ? 'hard-cut' : 'soft-crossfade');
  const transition = transitionForPreset(preset, storyMode);
  return { ...entry.scene, transition } as SceneInput;
}

function applyBeatComposition(entry: DirectionScene, scene: SceneInput): SceneInput {
  const composition = entry.beat.composition;
  const result = {
    ...scene,
    typographicRole: entry.beat.typographicRole,
    ...(composition?.chrome ? { chrome: composition.chrome } : {}),
  } as SceneInput;
  if (!composition || !('source' in result) || (result.type === 'result' && result.comparison !== undefined) || (composition.layout === undefined && composition.caption === undefined)) return result;
  return {
    ...result,
    presentation: {
      ...result.presentation,
      ...(composition.layout ? { layout: composition.layout } : {}),
      ...(composition.caption ? { caption: composition.caption } : {}),
    },
  } as SceneInput;
}

export function compileDirection(directionValue: unknown, currentProject: ProjectInput) {
  const direction = directionSchema.parse(directionValue);
  if (direction.status !== 'reviewed') throw new Error('Direction must be reviewed before compilation.');
  if (direction.executionMode === 'plan-only') throw new Error('Plan-only directions cannot compile or render. Change executionMode after authorizing execution.');
  if (!['tour', 'launch'].includes(direction.storyMode)) throw new Error(`Story mode ${direction.storyMode} is defined but is not renderable yet.`);
  for (const entry of direction.scenes) assertRenderedRecipeEvidence(entry);
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
  const scenes = direction.scenes.map((entry, index) => applyBeatComposition(entry, applyTransition(entry, index, direction.storyMode)));
  const project = prepareProject({ ...currentProject, scenes }) as unknown as ProjectInput;
  const duration = buildTimeline(project.scenes, FPS).at(-1)!.end / FPS;
  if (direction.storyMode === 'tour') {
    if (!direction.scenes.some((entry) => ['product-reveal', 'product-moment'].includes(entry.narrativeRole) && !['text', 'chapter', 'outro'].includes(entry.scene.type))) throw new Error('A product tour requires a real product moment.');
    if (!direction.scenes.some((entry) => entry.narrativeRole === 'verified-result' && hasVerifiedDisplayedResult(entry, currentProject.trimBefore))) throw new Error('A product tour requires a verified result displayed from its verified capture evidence.');
  }
  if (direction.storyMode === 'launch') {
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
  const mode = d.storyMode.split('-').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
  return `# ${mode} brief\n\n- **Audience:** ${d.audience}\n- **Primary message:** ${d.primaryMessage}\n- **Story mode:** ${d.storyMode}\n- **Motion language:** ${d.motionLanguage}\n- **Format:** ${d.format}\n- **Locale:** ${d.locale}\n- **Tone:** ${d.tone}\n- **Execution mode:** ${d.executionMode}\n- **Brand source:** ${d.brandSource}\n- **Audio:** silent; no audio stream\n${d.authorizedTarget ? `- **Authorized target:** ${d.authorizedTarget}\n` : ''}\n## Visual direction\n\n${d.visualDirection}\n\n## Facts\n\n${d.facts.length ? d.facts.map((fact) => `- ${fact}`).join('\n') : '- None recorded.'}\n\n## Exclusions and privacy\n\n${[...d.exclusions, ...d.privacy].length ? [...d.exclusions, ...d.privacy].map((item) => `- ${item}`).join('\n') : '- No additional constraints recorded.'}\n`;
}

export function renderStoryboard(directionValue: unknown) {
  const d = directionSchema.parse(directionValue);
  const rows = d.scenes.map((entry, index) => {
    const evidence = entry.evidence.map((item) => item.kind === 'capture' ? `capture @ ${item.timestamp.toFixed(2)}s${item.markId ? ` (${item.markId})` : ''}${item.verified ? ' verified' : ''}` : `authored: ${item.claim}`).join('; ');
    const compiledScene = applyBeatComposition(entry, entry.scene);
    const resolvedComposition = sceneComposition(compiledScene);
    const composition = `layout=${resolvedComposition.id} · caption=${resolvedComposition.caption} · chrome=${compiledScene.chrome ?? 'auto'} (${resolvedComposition.chromeVisible ? 'visible' : 'hidden'})`;
    return `## ${String(index + 1).padStart(2, '0')} — ${entry.scene.id}\n\n- **Role:** ${entry.narrativeRole}\n- **Reason:** ${entry.reason}\n- **Beat concept:** ${entry.beat.concept}\n- **Focal action:** ${entry.beat.focalAction}\n- **Typography:** ${entry.beat.typographicRole} · ${entry.beat.density}\n- **Composition:** ${composition}\n- **Transition intent:** ${entry.beat.transitionIntent}\n- **Type:** ${entry.scene.type}\n- **Motion recipe:** ${entry.beat.recipe.selected ?? motionRecipeFor(entry.scene) ?? entry.beat.recipe.fallback}\n- **Duration:** ${entry.scene.duration.toFixed(2)}s\n- **Settled preview:** ${entry.expectedSettledAt.toFixed(2)}s\n- **Title:** ${entry.scene.title.replaceAll('\n', ' / ')}\n- **Evidence:** ${evidence}\n`;
  });
  return `# Storyboard\n\nStory mode: **${d.storyMode}** · Motion language: **${d.motionLanguage}** · Tone: **${d.tone}** · Status: **${d.status}**\n\n${rows.join('\n')}\n`;
}

export function scenePackets(directionValue: unknown, directionRevision: string, projectRevision: string) {
  const direction = directionSchema.parse(directionValue);
  return direction.scenes.map((entry) => ({
    version: 1,
    sceneId: entry.scene.id,
    baseDirectionRevision: directionRevision,
    baseProjectRevision: projectRevision,
    captureFingerprint: direction.captureFingerprint,
    storyMode: direction.storyMode,
    motionLanguage: direction.motionLanguage,
    beat: entry.beat,
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
