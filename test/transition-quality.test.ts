import { describe, expect, it } from 'vitest';
import { frameStats, psnr, regionMeanAbsoluteDifference, regionMeanColorDifference, regionMeanLuma, regionPsnr } from '../studio/src/transition-quality.mjs';

function image(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    buffer.set(pixel(x, y), offset);
  }
  return buffer;
}

describe('transition frame quality', () => {
  it('distinguishes a flat empty surface from visible opaque content', () => {
    const blank = image(16, 16, () => [245, 245, 245, 255]);
    const content = image(16, 16, (x, y) => [(x * 19 + y * 7) % 256, (x * 3 + y * 29) % 256, (x * 31 + y * 11) % 256, 255]);
    expect(frameStats(blank, 16, 16, 1).blank).toBe(true);
    expect(frameStats(content, 16, 16, 1)).toMatchObject({ blank: false, alphaMinimum: 255 });
  });

  it('reports uncovered pixels and stable versus changed frames', () => {
    const opaque = image(8, 8, () => [20, 40, 80, 255]);
    const uncovered = Buffer.from(opaque);
    uncovered[3] = 0;
    const changed = image(8, 8, () => [80, 100, 140, 255]);
    expect(frameStats(uncovered, 8, 8, 1).alphaMinimum).toBe(0);
    expect(psnr(opaque, opaque, 4)).toBe(Infinity);
    expect(psnr(opaque, changed, 4)).toBeLessThan(20);
    expect(regionPsnr(opaque, opaque, { x: 0, y: 0, width: 8, height: 7 }, 8, 1)).toBe(Infinity);
    expect(regionPsnr(opaque, changed, { x: 0, y: 0, width: 8, height: 7 }, 8, 1)).toBeLessThan(20);
  });

  it('measures luma inside the requested chrome region', () => {
    const pixels = image(8, 8, (_x, y) => y < 4 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
    expect(regionMeanLuma(pixels, { x: 0, y: 0, width: 8, height: 4 }, 8, 1)).toBeCloseTo(255);
    expect(regionMeanLuma(pixels, { x: 0, y: 4, width: 8, height: 4 }, 8, 1)).toBe(0);
  });

  it('measures visual chrome presence against an unbranded reference', () => {
    const reference = image(8, 8, () => [245, 245, 245, 255]);
    const branded = Buffer.from(reference);
    for (let y = 1; y < 4; y += 1) for (let x = 1; x < 6; x += 1) {
      const offset = (y * 8 + x) * 4;
      branded.set([20, 40, 80, 255], offset);
    }
    expect(regionMeanAbsoluteDifference(reference, reference, { x: 0, y: 0, width: 8, height: 5 }, 8, 1)).toBe(0);
    expect(regionMeanAbsoluteDifference(branded, reference, { x: 0, y: 0, width: 8, height: 5 }, 8, 1)).toBeGreaterThan(40);
    expect(regionMeanColorDifference(reference, { r: 245, g: 245, b: 245 }, { x: 0, y: 0, width: 8, height: 5 }, 8, 1)).toBe(0);
    expect(regionMeanColorDifference(branded, { r: 245, g: 245, b: 245 }, { x: 0, y: 0, width: 8, height: 5 }, 8, 1)).toBeGreaterThan(40);
  });
});
