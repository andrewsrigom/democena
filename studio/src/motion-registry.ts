import type { Scene, Transition } from './model.js';

export const motionRecipeIds = [
  'standard-scene-motion',
  'text-blur-slide',
  'chapter-demote-to-label',
  'focus-scan-lock',
  'outro-strip-away',
] as const;
export type MotionRecipeId = (typeof motionRecipeIds)[number];
export type MotionRecipeImplementation = 'standard-scene' | 'text-panel' | 'chapter-demote' | 'focus-scan' | 'outro-strip-away';
export type MotionFixture = { project: string; sceneId: string };
export type MotionRecipe = {
  id: MotionRecipeId;
  implementation: MotionRecipeImplementation;
  sceneTypes: readonly Scene['type'][];
  defaultForSceneTypes: readonly Scene['type'][];
  purpose: string;
  vibe: 'clean' | 'editorial' | 'technical';
  energy: 'low' | 'medium';
  evidence: 'authored-copy' | 'capture-rectangle' | 'none';
  recommendedSeconds: readonly [minimum: number, maximum: number];
  useWhen: readonly string[];
  avoidWhen: readonly string[];
  lifecycle: readonly ['anticipation', 'action', 'settle', 'hold'];
  fixture: MotionFixture;
  fallback: MotionRecipeId;
  fallbackDescription: string;
};

export const motionRecipeRegistry: Record<MotionRecipeId, MotionRecipe> = {
  'standard-scene-motion': {
    id: 'standard-scene-motion', implementation: 'standard-scene',
    sceneTypes: ['text', 'chapter', 'overview', 'focus', 'camera', 'annotation', 'result', 'outro'],
    defaultForSceneTypes: ['overview', 'camera', 'annotation', 'result'],
    purpose: 'Render any supported scene with the stable baseline motion when no specialized recipe is selected.',
    vibe: 'clean', energy: 'low', evidence: 'none', recommendedSeconds: [3, 8],
    useWhen: ['A specialized recipe is unavailable or its evidence requirements are not met.'],
    avoidWhen: ['A compatible evidence-backed specialized recipe communicates the beat more clearly.'],
    lifecycle: ['anticipation', 'action', 'settle', 'hold'],
    fixture: { project: 'studio/project.json', sceneId: 'overview' },
    fallback: 'standard-scene-motion', fallbackDescription: 'Render the scene with its standard deterministic entrance and hold.',
  },
  'text-blur-slide': {
    id: 'text-blur-slide', implementation: 'text-panel', sceneTypes: ['text'], defaultForSceneTypes: ['text'],
    purpose: 'Reveal authored copy without competing with the product.', vibe: 'clean', energy: 'low', evidence: 'authored-copy', recommendedSeconds: [3, 6],
    useWhen: ['Authored copy should introduce one idea before product evidence appears.', 'A single highlighted term can carry the visual emphasis.'],
    avoidWhen: ['The product screen is the evidence; use an overview, focus or camera scene.', 'The copy needs more than two short lines; split it into separate beats.'],
    lifecycle: ['anticipation', 'action', 'settle', 'hold'], fixture: { project: 'studio/project.json', sceneId: 'opening' },
    fallback: 'standard-scene-motion', fallbackDescription: 'Fade the complete text block in place.',
  },
  'chapter-demote-to-label': {
    id: 'chapter-demote-to-label', implementation: 'chapter-demote', sceneTypes: ['chapter'], defaultForSceneTypes: ['chapter'],
    purpose: 'Turn a chapter headline into persistent context for the following product scene.', vibe: 'editorial', energy: 'low', evidence: 'authored-copy', recommendedSeconds: [2.5, 4.5],
    useWhen: ['The story crosses a real section boundary and benefits from a deliberate pause.', 'The chapter title should remain as compact context over the next product scene.'],
    avoidWhen: ['The next scene continues the same idea without a narrative boundary.', 'The heading describes evidence that should remain visible on the product screen.'],
    lifecycle: ['anticipation', 'action', 'settle', 'hold'], fixture: { project: 'studio/project.json', sceneId: 'chapter' },
    fallback: 'standard-scene-motion', fallbackDescription: 'Keep the chapter centered and cut to the product scene.',
  },
  'focus-scan-lock': {
    id: 'focus-scan-lock', implementation: 'focus-scan', sceneTypes: ['focus'], defaultForSceneTypes: ['focus'],
    purpose: 'Show the viewer where the product evidence is before the camera settles on it.', vibe: 'technical', energy: 'medium', evidence: 'capture-rectangle', recommendedSeconds: [4, 8],
    useWhen: ['One measured UI target is the subject and the viewer should locate it before the explanation.', 'The capture provides an evidence rectangle that can drive both scan and camera lock.'],
    avoidWhen: ['The target cannot be linked to a captured rectangle.', 'The whole interface must stay equally legible; use an overview scene instead.'],
    lifecycle: ['anticipation', 'action', 'settle', 'hold'], fixture: { project: 'studio/project.json', sceneId: 'focus' },
    fallback: 'standard-scene-motion', fallbackDescription: 'Use the standard evidence-linked spotlight.',
  },
  'outro-strip-away': {
    id: 'outro-strip-away', implementation: 'outro-strip-away', sceneTypes: ['outro'], defaultForSceneTypes: ['outro'],
    purpose: 'Remove presentation layers and leave a calm branded conclusion.', vibe: 'clean', energy: 'low', evidence: 'authored-copy', recommendedSeconds: [3, 6],
    useWhen: ['The story has finished and one benefit or action should remain.', 'A calm branded close should follow the verified product outcome.'],
    avoidWhen: ['Several actions or supporting details still need explanation.', 'The verified outcome has not appeared yet; show a result scene first.'],
    lifecycle: ['anticipation', 'action', 'settle', 'hold'], fixture: { project: 'studio/project.json', sceneId: 'closing' },
    fallback: 'standard-scene-motion', fallbackDescription: 'Reveal the closing panel in place.',
  },
};

export const motionRecipeVocabulary = motionRecipeIds.map((id) => motionRecipeRegistry[id]);
export const motionRecipes = motionRecipeVocabulary;
const defaultRecipeBySceneType = new Map<Scene['type'], MotionRecipeId>();
for (const recipe of motionRecipeVocabulary) for (const sceneType of recipe.defaultForSceneTypes) defaultRecipeBySceneType.set(sceneType, recipe.id);
export function motionRecipeFor(scene: Pick<Scene, 'type'>): MotionRecipeId { return defaultRecipeBySceneType.get(scene.type) ?? 'standard-scene-motion'; }
export function motionImplementationFor(scene: Pick<Scene, 'type'>): MotionRecipeImplementation { return motionRecipeRegistry[motionRecipeFor(scene)].implementation; }

export type TransitionImplementation =
  | { kind: 'cut' }
  | { kind: 'fade' }
  | { kind: 'translate'; axis: 'x' | 'y'; direction: -1 | 1; distance: number; unit: 'px' | '%'; fade: boolean };
export type TransitionFixture = { project: string; fromSceneId: string; toSceneId: string };
export type TransitionDefinition = { id: Transition['type']; implementation: TransitionImplementation; purpose: string; fixture: TransitionFixture; fallback: Transition['type'] };
const benchmarkFixture = { project: 'examples/benchmarks/forma/project.json', fromSceneId: 'hook', toSceneId: 'product' };
const studioFixture = { project: 'studio/project.json', fromSceneId: 'overview', toSceneId: 'focus' };
export const transitionRegistry: Record<Transition['type'], TransitionDefinition> = {
  none: { id: 'none', implementation: { kind: 'cut' }, purpose: 'Cut directly without overlapping visual motion.', fixture: benchmarkFixture, fallback: 'none' },
  fade: { id: 'fade', implementation: { kind: 'fade' }, purpose: 'Blend neighboring scenes without adding directional velocity.', fixture: { ...benchmarkFixture, fromSceneId: 'product', toSceneId: 'proof' }, fallback: 'none' },
  slide: { id: 'slide', implementation: { kind: 'translate', axis: 'y', direction: 1, distance: 36, unit: 'px', fade: true }, purpose: 'Lift content subtly while fading it into the current composition.', fixture: studioFixture, fallback: 'fade' },
  'slide-up': { id: 'slide-up', implementation: { kind: 'translate', axis: 'y', direction: 1, distance: 100, unit: '%', fade: false }, purpose: 'Cover the outgoing scene from below for a strong upward advance.', fixture: { ...benchmarkFixture, fromSceneId: 'proof', toSceneId: 'close' }, fallback: 'fade' },
  'slide-down': { id: 'slide-down', implementation: { kind: 'translate', axis: 'y', direction: -1, distance: 100, unit: '%', fade: false }, purpose: 'Cover the outgoing scene from above for a downward reveal.', fixture: { ...studioFixture, fromSceneId: 'public-catalog', toSceneId: 'closing' }, fallback: 'fade' },
  'slide-left': { id: 'slide-left', implementation: { kind: 'translate', axis: 'x', direction: 1, distance: 100, unit: '%', fade: false }, purpose: 'Advance horizontally while preserving leftward reading momentum.', fixture: benchmarkFixture, fallback: 'fade' },
  'slide-right': { id: 'slide-right', implementation: { kind: 'translate', axis: 'x', direction: -1, distance: 100, unit: '%', fade: false }, purpose: 'Return horizontally while preserving rightward reading momentum.', fixture: studioFixture, fallback: 'fade' },
};
export function transitionStyleFor(type: Transition['type'], enter: number) {
  const implementation = transitionRegistry[type].implementation;
  if (implementation.kind === 'cut') return { opacity: 1 };
  if (implementation.kind === 'fade') return { opacity: enter };
  const offset = (1 - enter) * implementation.direction * implementation.distance;
  const transform = implementation.axis === 'x' ? `translateX(${offset}${implementation.unit})` : `translateY(${offset}${implementation.unit})`;
  return { opacity: implementation.fade ? enter : 1, transform };
}

export const transitionPresetIds = ['hard-cut', 'soft-crossfade', 'clean-slide', 'rise-cover', 'drop-cover'] as const;
export type TransitionPresetId = (typeof transitionPresetIds)[number];
export type TransitionPreset = { id: TransitionPresetId; implementation: Transition['type']; purpose: string; duration: { default: number; launch: number }; fixture: TransitionFixture; fallback: TransitionPresetId };
export const transitionPresetRegistry: Record<TransitionPresetId, TransitionPreset> = {
  'hard-cut': { id: 'hard-cut', implementation: 'none', purpose: 'Start or reset a sequence without transition overlap.', duration: { default: 0, launch: 0 }, fixture: benchmarkFixture, fallback: 'hard-cut' },
  'soft-crossfade': { id: 'soft-crossfade', implementation: 'fade', purpose: 'Continue between compatible compositions without directional emphasis.', duration: { default: .4, launch: .3 }, fixture: { ...benchmarkFixture, fromSceneId: 'product', toSceneId: 'proof' }, fallback: 'hard-cut' },
  'clean-slide': { id: 'clean-slide', implementation: 'slide', purpose: 'Advance related content with a restrained vertical lift.', duration: { default: .45, launch: .35 }, fixture: studioFixture, fallback: 'soft-crossfade' },
  'rise-cover': { id: 'rise-cover', implementation: 'slide-up', purpose: 'Reveal a meaningful new stage by covering upward.', duration: { default: .55, launch: .4 }, fixture: { ...benchmarkFixture, fromSceneId: 'proof', toSceneId: 'close' }, fallback: 'soft-crossfade' },
  'drop-cover': { id: 'drop-cover', implementation: 'slide-down', purpose: 'Reveal a meaningful new stage by covering downward.', duration: { default: .55, launch: .4 }, fixture: { ...studioFixture, fromSceneId: 'public-catalog', toSceneId: 'closing' }, fallback: 'soft-crossfade' },
};
export function transitionForPreset(id: TransitionPresetId, storyMode: string): Transition {
  const preset = transitionPresetRegistry[id];
  return { type: preset.implementation, duration: storyMode === 'launch' ? preset.duration.launch : preset.duration.default };
}
