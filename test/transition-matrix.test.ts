import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Project } from '../studio/src/model.js';
import { transitionRegistry } from '../studio/src/motion-registry.js';
import { chromeMatrix, transitionMatrix, transitionPhases } from '../studio/src/transition-matrix.mjs';
import type { ChromeMatrixEntry } from '../studio/src/transition-matrix.mjs';
import { buildTimeline, FPS, prepareProject } from '../studio/src/timeline.js';

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
      expect(entry.destinationReferenceFrame).toBeGreaterThanOrEqual(0);
      expect(entry.destinationReferenceFrame).toBeLessThan(buildTimeline(entry.destinationProject.scenes, FPS).at(-1)!.end);
      expect(entry.destinationSettledReferenceFrame).toBeGreaterThan(entry.destinationReferenceFrame);
      expect(entry.destinationSettledReferenceFrame).toBeLessThan(buildTimeline(entry.destinationProject.scenes, FPS).at(-1)!.end);
    }
  });

  it('models cuts without overlap and animated transitions with overlap', () => {
    const matrix = transitionMatrix(fixture);
    expect(matrix.find((entry) => entry.id === 'none')?.transitionFrames).toBe(0);
    expect(matrix.filter((entry) => entry.id !== 'none').every((entry) => entry.transitionFrames > 0)).toBe(true);
  });

  it('covers every presentation chrome handoff with explicit visibility expectations', () => {
    const matrix = chromeMatrix(fixture);
    const expectedIds: ChromeMatrixEntry['id'][] = [
      'chrome-framed-to-full-bleed',
      'chrome-full-bleed-to-framed',
      'chrome-full-bleed-to-full-bleed',
      'chrome-visible-framed-to-immersive',
      'chrome-visible-immersive-to-framed',
      'chrome-chapter-to-product-stage',
      'chrome-chapter-to-detail-crop',
      'chrome-visible-layered-product',
      'chrome-explicit-hide-to-show',
      'chrome-explicit-show-to-hide',
    ];
    expect(matrix.map((entry) => entry.id)).toEqual(expectedIds);
    expect(matrix.map((entry) => entry.project.scenes.map((scene) => 'presentation' in scene ? scene.presentation?.layout : undefined))).toEqual([
      ['framed', 'full-bleed'],
      ['full-bleed', 'framed'],
      ['full-bleed', 'full-bleed'],
      ['framed', 'full-bleed'],
      ['full-bleed', 'framed'],
      [undefined, 'product-stage'],
      [undefined, 'detail-crop'],
      ['framed', 'layered-product'],
      ['framed', 'full-bleed'],
      ['full-bleed', 'framed'],
    ]);
    expect(matrix.map((entry) => entry.expectedChrome)).toEqual([
      { before: true, midpoint: false, after: false },
      { before: false, midpoint: false, after: true },
      { before: false, midpoint: false, after: false },
      { before: true, midpoint: true, after: true },
      { before: true, midpoint: true, after: true },
      { before: true, midpoint: true, after: true },
      { before: true, midpoint: true, after: true },
      { before: true, midpoint: true, after: true },
      { before: false, midpoint: false, after: true },
      { before: true, midpoint: false, after: false },
    ]);
    expect(matrix.find((entry) => entry.id === 'chrome-visible-framed-to-immersive')?.expectedBackdrop)
      .toEqual({ midpoint: true, after: true });
    expect(matrix.find((entry) => entry.id === 'chrome-visible-immersive-to-framed')?.expectedBackdrop)
      .toEqual({ before: true, midpoint: true, after: false });
    const topRightScene = matrix.find((entry) => entry.id === 'chrome-explicit-hide-to-show')?.project.scenes[1];
    expect(topRightScene && 'presentation' in topRightScene ? topRightScene.presentation?.caption : undefined).toBe('top-right');
    for (const entry of matrix) {
      expect(() => prepareProject(entry.project)).not.toThrow();
      expect(entry.frames.before).toBeLessThan(entry.frames.midpoint);
      expect(entry.frames.midpoint).toBeLessThan(entry.frames.after);
      expect(entry.frames.settledCheck).toBeLessThan(entry.durationInFrames);
    }
  });
});
