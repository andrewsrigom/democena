import { describe, expect, it } from 'vitest';
import { motionRecipeFor, motionRecipes, motionRecipeVocabulary } from '../studio/src/motion-recipes.js';
import type { Scene } from '../studio/src/model.js';

describe('motion recipe vocabulary', () => {
  it('maps semantic scene types to deterministic internal recipes', () => {
    expect(motionRecipeFor({ type: 'text' } as Pick<Scene, 'type'>)).toBe('text-blur-slide');
    expect(motionRecipeFor({ type: 'chapter' } as Pick<Scene, 'type'>)).toBe('chapter-demote-to-label');
    expect(motionRecipeFor({ type: 'focus' } as Pick<Scene, 'type'>)).toBe('focus-scan-lock');
    expect(motionRecipeFor({ type: 'outro' } as Pick<Scene, 'type'>)).toBe('outro-strip-away');
    expect(motionRecipeFor({ type: 'overview' } as Pick<Scene, 'type'>)).toBeUndefined();
  });

  it('documents evidence and a safe fallback for every recipe', () => {
    expect(new Set(motionRecipes.map((recipe) => recipe.id)).size).toBe(motionRecipes.length);
    for (const recipe of motionRecipes) {
      expect(recipe.purpose.length).toBeGreaterThan(20);
      expect(recipe.fallback.length).toBeGreaterThan(20);
      expect(recipe.lifecycle).toEqual(['anticipation', 'action', 'settle', 'hold']);
    }
  });

  it('advertises the standard fallback used by unspecialized scene types', () => {
    expect(motionRecipeVocabulary.map((recipe) => recipe.id)).toContain('standard-scene-motion');
    expect(motionRecipeVocabulary.find((recipe) => recipe.id === 'standard-scene-motion')?.sceneTypes).toContain('overview');
  });
});
