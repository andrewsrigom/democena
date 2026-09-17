import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  motionImplementationFor,
  motionRecipeFor,
  motionRecipeIds,
  motionRecipeRegistry,
  motionRecipeVocabulary,
  transitionForPreset,
  transitionPresetRegistry,
  transitionRegistry,
  transitionStyleFor,
} from '../studio/src/motion-registry.js';
import type { Project, Scene } from '../studio/src/model.js';

function projectFixture(file: string) {
  return JSON.parse(readFileSync(file, 'utf8')) as Project;
}

describe('shared motion registry', () => {
  it('maps every scene type to one deterministic implemented recipe', () => {
    const expected = {
      text: 'text-blur-slide', chapter: 'chapter-demote-to-label', overview: 'standard-scene-motion',
      focus: 'focus-scan-lock', camera: 'standard-scene-motion', annotation: 'standard-scene-motion',
      result: 'standard-scene-motion', outro: 'outro-strip-away',
    } as const;
    for (const [type, id] of Object.entries(expected)) expect(motionRecipeFor({ type } as Pick<Scene, 'type'>)).toBe(id);
    expect(motionImplementationFor({ type: 'focus' } as Pick<Scene, 'type'>)).toBe('focus-scan');
  });

  it('requires implementation, metadata, a real fixture and a deterministic fallback for every recipe', () => {
    expect(Object.keys(motionRecipeRegistry)).toEqual([...motionRecipeIds]);
    expect(motionRecipeVocabulary).toHaveLength(motionRecipeIds.length);
    const defaults = new Set<Scene['type']>();
    for (const recipe of motionRecipeVocabulary) {
      expect(recipe.implementation.length).toBeGreaterThan(0);
      expect(recipe.purpose.length).toBeGreaterThan(20);
      expect(recipe.fallbackDescription.length).toBeGreaterThan(20);
      expect(recipe.lifecycle).toEqual(['anticipation', 'action', 'settle', 'hold']);
      expect(motionRecipeRegistry[recipe.fallback]).toBeDefined();
      const fixture = projectFixture(recipe.fixture.project);
      expect(fixture.scenes.some((scene) => scene.id === recipe.fixture.sceneId && recipe.sceneTypes.includes(scene.type))).toBe(true);
      for (const sceneType of recipe.defaultForSceneTypes) {
        expect(defaults.has(sceneType)).toBe(false);
        defaults.add(sceneType);
      }
    }
    expect([...defaults].sort()).toEqual(['annotation', 'camera', 'chapter', 'focus', 'outro', 'overview', 'result', 'text']);
  });

  it('drives every rendered transition and semantic preset from registered metadata', () => {
    for (const transition of Object.values(transitionRegistry)) {
      expect(transition.purpose.length).toBeGreaterThan(20);
      expect(transitionRegistry[transition.fallback]).toBeDefined();
      const fixture = projectFixture(transition.fixture.project);
      expect(fixture.scenes.some((scene) => scene.id === transition.fixture.fromSceneId)).toBe(true);
      expect(fixture.scenes.some((scene) => scene.id === transition.fixture.toSceneId)).toBe(true);
    }
    for (const preset of Object.values(transitionPresetRegistry)) {
      expect(transitionRegistry[preset.implementation]).toBeDefined();
      expect(transitionPresetRegistry[preset.fallback]).toBeDefined();
      expect(preset.purpose.length).toBeGreaterThan(20);
    }
    expect(transitionStyleFor('slide-down', 0)).toEqual({ opacity: 1, transform: 'translateY(-100%)' });
    expect(transitionStyleFor('slide', .5)).toEqual({ opacity: .5, transform: 'translateY(18px)' });
    expect(transitionForPreset('rise-cover', 'launch')).toEqual({ type: 'slide-up', duration: .4 });
  });
});
