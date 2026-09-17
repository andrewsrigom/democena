import { describe, expect, it } from 'vitest';
import { browserLayout, comparisonLayout } from '../studio/src/layout.js';

describe('motion layout', () => {
  it.each([{width:1280,height:800}, {width:1024,height:768}, {width:390,height:844}, {width:2560,height:1080}])('fits the entire browser for $width x $height', (viewport) => {
    const box = browserLayout(viewport);
    expect(box.left).toBeGreaterThanOrEqual(664);
    expect(box.left + box.width).toBeLessThanOrEqual(1824);
    expect(box.top).toBeGreaterThanOrEqual(158);
    expect(box.top + box.height + box.chromeHeight).toBeLessThanOrEqual(938);
    expect(box.width / box.height).toBeCloseTo(viewport.width / viewport.height);
  });

  it('keeps the crop in a bounded inner window when a tall crop needs letterboxing', () => {
    const crop = { x: 133, y: 527, width: 420, height: 220 };
    const clip = comparisonLayout(crop);
    expect(clip.height).toBeCloseTo(280);
    expect(clip.width).toBeCloseTo(534.5454545);
    expect(clip.left).toBeGreaterThan(0);
    expect(clip.left + clip.width / 2).toBeCloseTo(1160 / 2);
    // Both corners map exactly to the inner clipping window, with no neighboring UI.
    expect(crop.x * clip.scale + clip.videoLeft).toBeCloseTo(0);
    expect(crop.y * clip.scale + clip.videoTop).toBeCloseTo(0);
    expect((crop.x + crop.width) * clip.scale + clip.videoLeft).toBeCloseTo(clip.width);
    expect((crop.y + crop.height) * clip.scale + clip.videoTop).toBeCloseTo(clip.height);
  });

  it('uses the full card width for a wide result crop', () => {
    expect(comparisonLayout({ x: 112, y: 527, width: 1056, height: 150 }).left).toBe(0);
  });
});
