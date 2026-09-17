import type { Scene, Transition } from '../../src/model.js';
import {
  motionRecipeIds,
  motionRecipeRegistry,
  transitionForPreset,
  transitionPresetIds,
  transitionPresetRegistry,
  transitionRegistry,
} from '../../src/motion-registry.js';
import type { MotionRecipeId, TransitionPresetId } from '../../src/motion-registry.js';
import { buildTimeline, FPS, prepareProject } from '../../src/timeline.js';

export type CatalogKind = 'recipe' | 'transition' | 'preset';
export type CatalogItem = { kind: CatalogKind; id: string; label: string; summary: string; tags: readonly string[] };
export type Selected = { kind: CatalogKind; id: string };

const transitionIds = Object.keys(transitionRegistry) as Transition['type'][];
export const catalog: CatalogItem[] = [
  ...motionRecipeIds.map((id) => {
    const recipe = motionRecipeRegistry[id];
    return { kind: 'recipe' as const, id, label: id, summary: recipe.purpose, tags: [...recipe.sceneTypes, recipe.vibe, recipe.energy] };
  }),
  ...transitionIds.map((id) => ({ kind: 'transition' as const, id, label: id, summary: transitionRegistry[id].purpose, tags: ['rendered', transitionRegistry[id].implementation.kind] })),
  ...transitionPresetIds.map((id) => ({ kind: 'preset' as const, id, label: id, summary: transitionPresetRegistry[id].purpose, tags: ['director', transitionPresetRegistry[id].implementation] })),
];

export function sceneForRecipe(recipeId: MotionRecipeId, selectedFixture: unknown, registryFixture: unknown) {
  const recipe = motionRecipeRegistry[recipeId];
  const chosen = prepareProject(selectedFixture);
  const registry = prepareProject(registryFixture);
  const preferredTypes = recipe.defaultForSceneTypes.length > 0 ? recipe.defaultForSceneTypes : recipe.sceneTypes;
  const source = chosen.scenes.find((scene) => preferredTypes.includes(scene.type))
    ?? registry.scenes.find((scene) => scene.id === recipe.fixture.sceneId)
    ?? registry.scenes.find((scene) => recipe.sceneTypes.includes(scene.type));
  if (!source) throw new Error(`Fixture scene missing for ${recipeId}.`);
  return { project: chosen, scene: { ...source, transition: { type: 'none' as const, duration: 0 } } as Scene };
}

export function previewFor(selection: Selected, selectedFixture: unknown, registryFixture: unknown) {
  const fixture = prepareProject(selectedFixture);
  if (selection.kind === 'recipe') {
    const { project, scene } = sceneForRecipe(selection.id as MotionRecipeId, selectedFixture, registryFixture);
    const preview = prepareProject({ ...project, scenes: [scene] });
    return { project: preview, durationInFrames: Math.max(1, Math.round(scene.duration * FPS)), title: `${selection.id} · ${scene.type}` };
  }
  const scenes = fixture.scenes.slice(0, 2);
  if (scenes.length < 2) throw new Error('Fixture requires at least two scenes.');
  const transition = selection.kind === 'preset'
    ? transitionForPreset(selection.id as TransitionPresetId, 'tour')
    : { type: selection.id as Transition['type'], duration: selection.id === 'none' ? 0 : .5 };
  const preview = prepareProject({ ...fixture, scenes: [
    { ...scenes[0]!, transition: { type: 'none', duration: 0 } },
    { ...scenes[1]!, transition },
  ] });
  return { project: preview, durationInFrames: buildTimeline(preview.scenes, FPS).at(-1)!.end, title: `${selection.id} · ${transition.type}` };
}
