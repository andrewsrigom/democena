import type { CompositionLayout, Focus } from './model.js';

export type ProductLayoutBox = { width: number; height: number; left: number; top: number; chromeHeight: number };

function framedStageLayout(viewport: { width: number; height: number }, stage: { left: number; top: number; width: number; height: number }): ProductLayoutBox {
  const chromeHeight = 48;
  const width = Math.min(stage.width, (stage.height - chromeHeight) * viewport.width / viewport.height);
  const height = width * viewport.height / viewport.width;
  return {
    width, height,
    left: stage.left + (stage.width - width) / 2,
    top: stage.top + (stage.height - chromeHeight - height) / 2,
    chromeHeight,
  };
}

/** Keep the whole browser, including its chrome, inside the presentation stage. */
export function browserLayout(viewport: { width: number; height: number }) {
  return framedStageLayout(viewport, { left: 664, top: 158, width: 1160, height: 780 });
}

/** Cover the output canvas with the recorded viewport and crop only the overflow. */
export function fullBleedLayout(viewport: { width: number; height: number }, canvas: { width: number; height: number }) {
  const width = Math.max(canvas.width, canvas.height * viewport.width / viewport.height);
  const height = width * viewport.height / viewport.width;
  return { width, height, left: (canvas.width - width) / 2, top: (canvas.height - height) / 2, chromeHeight: 0 };
}

export function productLayout(layout: CompositionLayout, viewport: { width: number; height: number }, canvas: { width: number; height: number }) {
  if (layout === 'full-bleed' || layout === 'full-bleed-proof') return { primary: fullBleedLayout(viewport, canvas) };
  if (layout === 'product-stage') return { primary: framedStageLayout(viewport, { left: 250, top: 126, width: 1420, height: 820 }) };
  if (layout === 'detail-crop') return { primary: framedStageLayout(viewport, { left: 604, top: 122, width: 1250, height: 838 }) };
  if (layout === 'layered-product') return {
    primary: framedStageLayout(viewport, { left: 494, top: 168, width: 1300, height: 780 }),
    secondary: framedStageLayout(viewport, { left: 690, top: 140, width: 1040, height: 724 }),
  };
  return { primary: browserLayout(viewport) };
}

/** The clip has its own bounds: letterboxing must never reveal neighboring UI. */
export function comparisonLayout(crop: Focus, width = 1160, maxHeight = 280) {
  const scale = Math.min(width / crop.width, maxHeight / crop.height);
  return { scale, width: crop.width * scale, height: crop.height * scale,
    left: (width - crop.width * scale) / 2, videoLeft: -crop.x * scale, videoTop: -crop.y * scale };
}
