import type { Focus } from './model.js';

/** Keep the whole browser, including its chrome, inside the presentation stage. */
export function browserLayout(viewport: { width: number; height: number }) {
  const stage = { left: 664, top: 158, width: 1160, height: 780 };
  const chromeHeight = 48;
  const width = Math.min(stage.width, (stage.height - chromeHeight) * viewport.width / viewport.height);
  const height = width * viewport.height / viewport.width;
  return { width, height, left: stage.left + (stage.width - width) / 2,
    top: stage.top + (stage.height - chromeHeight - height) / 2, chromeHeight };
}

/** The clip has its own bounds: letterboxing must never reveal neighboring UI. */
export function comparisonLayout(crop: Focus, width = 1160, maxHeight = 280) {
  const scale = Math.min(width / crop.width, maxHeight / crop.height);
  return { scale, width: crop.width * scale, height: crop.height * scale,
    left: (width - crop.width * scale) / 2, videoLeft: -crop.x * scale, videoTop: -crop.y * scale };
}
