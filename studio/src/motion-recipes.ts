import type { Scene } from './model.js';

export type MotionRecipeId = 'text-blur-slide' | 'chapter-demote-to-label' | 'focus-scan-lock' | 'outro-strip-away';
export type MotionRecipe = {
  id: MotionRecipeId;
  sceneTypes: Scene['type'][];
  purpose: string;
  energy: 'low' | 'medium';
  evidence: 'authored-copy' | 'capture-rectangle' | 'none';
  lifecycle: readonly ['anticipation', 'action', 'settle', 'hold'];
  fallback: string;
};

export const motionRecipes: readonly MotionRecipe[] = [
  {
    id: 'text-blur-slide',
    sceneTypes: ['text'],
    purpose: 'Reveal authored copy without competing with the product.',
    energy: 'low',
    evidence: 'authored-copy',
    lifecycle: ['anticipation', 'action', 'settle', 'hold'],
    fallback: 'Fade the complete text block in place.',
  },
  {
    id: 'chapter-demote-to-label',
    sceneTypes: ['chapter'],
    purpose: 'Turn a chapter headline into persistent context for the following product scene.',
    energy: 'low',
    evidence: 'authored-copy',
    lifecycle: ['anticipation', 'action', 'settle', 'hold'],
    fallback: 'Keep the chapter centered and cut to the product scene.',
  },
  {
    id: 'focus-scan-lock',
    sceneTypes: ['focus'],
    purpose: 'Show the viewer where the product evidence is before the camera settles on it.',
    energy: 'medium',
    evidence: 'capture-rectangle',
    lifecycle: ['anticipation', 'action', 'settle', 'hold'],
    fallback: 'Use the standard evidence-linked spotlight.',
  },
  {
    id: 'outro-strip-away',
    sceneTypes: ['outro'],
    purpose: 'Remove presentation layers and leave a calm branded conclusion.',
    energy: 'low',
    evidence: 'authored-copy',
    lifecycle: ['anticipation', 'action', 'settle', 'hold'],
    fallback: 'Reveal the closing panel in place.',
  },
] as const;

const bySceneType = new Map<Scene['type'], MotionRecipeId>(motionRecipes.flatMap((recipe) => recipe.sceneTypes.map((type) => [type, recipe.id] as const)));

export function motionRecipeFor(scene: Pick<Scene, 'type'>): MotionRecipeId | undefined {
  return bySceneType.get(scene.type);
}
