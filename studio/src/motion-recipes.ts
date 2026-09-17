import type { Scene } from './model.js';

export type MotionRecipeId = 'standard-scene-motion' | 'text-blur-slide' | 'chapter-demote-to-label' | 'focus-scan-lock' | 'outro-strip-away';
export type MotionRecipe = {
  id: MotionRecipeId;
  sceneTypes: Scene['type'][];
  purpose: string;
  vibe: 'clean' | 'editorial' | 'technical';
  energy: 'low' | 'medium';
  evidence: 'authored-copy' | 'capture-rectangle' | 'none';
  recommendedSeconds: readonly [minimum: number, maximum: number];
  useWhen: readonly string[];
  avoidWhen: readonly string[];
  lifecycle: readonly ['anticipation', 'action', 'settle', 'hold'];
  fallback: string;
};

export const motionRecipes: readonly MotionRecipe[] = [
  {
    id: 'text-blur-slide',
    sceneTypes: ['text'],
    purpose: 'Reveal authored copy without competing with the product.',
    vibe: 'clean',
    energy: 'low',
    evidence: 'authored-copy',
    recommendedSeconds: [3, 6],
    useWhen: [
      'Authored copy should introduce one idea before product evidence appears.',
      'A single highlighted term can carry the visual emphasis.',
    ],
    avoidWhen: [
      'The product screen is the evidence; use an overview, focus or camera scene.',
      'The copy needs more than two short lines; split it into separate beats.',
    ],
    lifecycle: ['anticipation', 'action', 'settle', 'hold'],
    fallback: 'Fade the complete text block in place.',
  },
  {
    id: 'chapter-demote-to-label',
    sceneTypes: ['chapter'],
    purpose: 'Turn a chapter headline into persistent context for the following product scene.',
    vibe: 'editorial',
    energy: 'low',
    evidence: 'authored-copy',
    recommendedSeconds: [2.5, 4.5],
    useWhen: [
      'The story crosses a real section boundary and benefits from a deliberate pause.',
      'The chapter title should remain as compact context over the next product scene.',
    ],
    avoidWhen: [
      'The next scene continues the same idea without a narrative boundary.',
      'The heading describes evidence that should remain visible on the product screen.',
    ],
    lifecycle: ['anticipation', 'action', 'settle', 'hold'],
    fallback: 'Keep the chapter centered and cut to the product scene.',
  },
  {
    id: 'focus-scan-lock',
    sceneTypes: ['focus'],
    purpose: 'Show the viewer where the product evidence is before the camera settles on it.',
    vibe: 'technical',
    energy: 'medium',
    evidence: 'capture-rectangle',
    recommendedSeconds: [4, 8],
    useWhen: [
      'One measured UI target is the subject and the viewer should locate it before the explanation.',
      'The capture provides an evidence rectangle that can drive both scan and camera lock.',
    ],
    avoidWhen: [
      'The target cannot be linked to a captured rectangle.',
      'The whole interface must stay equally legible; use an overview scene instead.',
    ],
    lifecycle: ['anticipation', 'action', 'settle', 'hold'],
    fallback: 'Use the standard evidence-linked spotlight.',
  },
  {
    id: 'outro-strip-away',
    sceneTypes: ['outro'],
    purpose: 'Remove presentation layers and leave a calm branded conclusion.',
    vibe: 'clean',
    energy: 'low',
    evidence: 'authored-copy',
    recommendedSeconds: [3, 6],
    useWhen: [
      'The story has finished and one benefit or action should remain.',
      'A calm branded close should follow the verified product outcome.',
    ],
    avoidWhen: [
      'Several actions or supporting details still need explanation.',
      'The verified outcome has not appeared yet; show a result scene first.',
    ],
    lifecycle: ['anticipation', 'action', 'settle', 'hold'],
    fallback: 'Reveal the closing panel in place.',
  },
] as const;

export const standardMotionRecipe: MotionRecipe = {
  id: 'standard-scene-motion',
  sceneTypes: ['text', 'chapter', 'overview', 'focus', 'camera', 'annotation', 'result', 'outro'],
  purpose: 'Render any supported scene with the stable baseline motion when no specialized recipe is selected.',
  vibe: 'clean',
  energy: 'low',
  evidence: 'none',
  recommendedSeconds: [3, 8],
  useWhen: ['A specialized recipe is unavailable or its evidence requirements are not met.'],
  avoidWhen: ['A compatible evidence-backed specialized recipe communicates the beat more clearly.'],
  lifecycle: ['anticipation', 'action', 'settle', 'hold'],
  fallback: 'Render the scene with its standard deterministic entrance and hold.',
};

export const motionRecipeVocabulary: readonly MotionRecipe[] = [standardMotionRecipe, ...motionRecipes];

const bySceneType = new Map<Scene['type'], MotionRecipeId>(motionRecipes.flatMap((recipe) => recipe.sceneTypes.map((type) => [type, recipe.id] as const)));

export function motionRecipeFor(scene: Pick<Scene, 'type'>): MotionRecipeId | undefined {
  return bySceneType.get(scene.type);
}
