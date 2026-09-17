import { describe, expect, it } from 'vitest';
import { cameraFor, cameraPoint } from '../studio/src/camera.js';

const viewport = { width: 1280, height: 800 };
const width = 1170;
const ratio = width / viewport.width;

describe('motion camera', () => {
  it('keeps a centered result fully readable when zooming', () => {
    const focus = { x: 133, y: 634.5, width: 1014, height: 22.5 };
    const camera = cameraFor(focus, viewport, width);
    const left = focus.x * ratio * camera.scale + width * (1 - camera.scale) / 2 + camera.x;
    const right = left + focus.width * ratio * camera.scale;
    expect(left).toBeGreaterThan(24);
    expect(right).toBeLessThan(width - 24);
    expect(camera.x).toBeCloseTo(0);
  });

  it('never pans beyond the recorded image', () => {
    for (const x of [0, 133, 1000]) for (const y of [0, 400, 740]) {
      const camera = cameraFor({ x, y, width: 180, height: 40 }, viewport, width);
      expect(Math.abs(camera.x)).toBeLessThanOrEqual(width * (camera.scale - 1) / 2 + 1e-9);
      expect(Math.abs(camera.y)).toBeLessThanOrEqual(viewport.height * ratio * (camera.scale - 1) / 2 + 1e-9);
    }
  });

  it('preserves the whole viewport for overview scenes and full-page focus', () => {
    expect(cameraFor(undefined, viewport, width)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(cameraFor({ x: 0, y: 0, ...viewport }, viewport, width).scale).toBe(1);
  });

  it('maps a focused source point into the visible camera viewport', () => {
    const focus = { x: 760, y: 220, width: 300, height: 180 };
    const camera = cameraFor(focus, viewport, width, 1.8);
    const rendered = cameraPoint({ x: focus.x + focus.width / 2, y: focus.y + focus.height / 2 }, viewport, width, camera);
    expect(rendered.x).toBeCloseTo(width / 2);
    expect(rendered.y).toBeCloseTo(width * viewport.height / viewport.width / 2);
  });

  it('uses cover-crop margins to keep edge evidence inside the visible canvas', () => {
    const coverWidth = 1920;
    const coverHeight = coverWidth * viewport.height / viewport.width;
    const visible = { width: 1920, height: 1080 };
    const wrapperTop = (visible.height - coverHeight) / 2;
    for (const focus of [
      { x: 500, y: 0, width: 280, height: 120 },
      { x: 500, y: 680, width: 280, height: 120 },
    ]) {
      const camera = cameraFor(focus, viewport, coverWidth, 1.24, visible);
      const top = cameraPoint({ x: focus.x, y: focus.y }, viewport, coverWidth, camera).y + wrapperTop;
      const bottom = cameraPoint({ x: focus.x, y: focus.y + focus.height }, viewport, coverWidth, camera).y + wrapperTop;
      expect(top).toBeGreaterThanOrEqual(0);
      expect(bottom).toBeLessThanOrEqual(visible.height);
    }
  });
});
