import type { Focus } from './model.js';

export { browserLayout, fullBleedLayout, OUTPUT_CANVAS, productLayout } from './canvas-geometry.mjs';

export type ProductLayoutBox = { width: number; height: number; left: number; top: number; chromeHeight: number };

/** The clip has its own bounds: letterboxing must never reveal neighboring UI. */
export function comparisonLayout(crop: Focus, width = 1160, maxHeight = 280) {
  const scale = Math.min(width / crop.width, maxHeight / crop.height);
  return { scale, width: crop.width * scale, height: crop.height * scale,
    left: (width - crop.width * scale) / 2, videoLeft: -crop.x * scale, videoTop: -crop.y * scale };
}
