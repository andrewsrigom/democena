import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Project } from '../studio/src/model.js';
import { transitionRegistry } from '../studio/src/motion-registry.js';
import { transitionMatrix, transitionPhases } from '../studio/src/transition-matrix.mjs';

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('../examples/motion-registry/project.json', import.meta.url)), 'utf8')) as Project;

describe('transition matrix', () => {
  it('covers every rendered transition with before, midpoint and settled after frames', () => {
    const matrix = transitionMatrix(fixture);
    expect(Object.keys(transitionRegistry)).toEqual(['none', 'fade', 'slide', 'slide-up', 'slide-down', 'slide-left', 'slide-right']);
    expect(matrix.map((entry) => entry.id)).toEqual(Object.keys(transitionRegistry));
    for (const entry of matrix) {
      expect(entry.project.scenes.map((scene) => scene.id)).toEqual([entry.fromSceneId, entry.toSceneId]);
      expect(entry.project.scenes[1]?.transition?.type).toBe(entry.id);
      expect(transitionPhases.map((phase) => entry.frames[phase])).toEqual([
        entry.frames.before,
        entry.frames.midpoint,
        entry.frames.after,
      ]);
      expect(entry.frames.before).toBeLessThan(entry.frames.midpoint);
      expect(entry.frames.midpoint).toBeLessThan(entry.frames.after);
      expect(entry.frames.after).toBeLessThan(entry.durationInFrames);
      expect(entry.frames.settledCheck).toBeGreaterThan(entry.frames.after);
      expect(entry.frames.settledCheck).toBeLessThan(entry.durationInFrames);
    }
  });

  it('models cuts without overlap and animated transitions with overlap', () => {
    const matrix = transitionMatrix(fixture);
    expect(matrix.find((entry) => entry.id === 'none')?.transitionFrames).toBe(0);
    expect(matrix.filter((entry) => entry.id !== 'none').every((entry) => entry.transitionFrames > 0)).toBe(true);
  });
});
