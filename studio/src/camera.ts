import type { Focus } from './model.js';

/** Translation is relative to CSS's center transform origin. Never expose empty canvas. */
export function cameraFor(focus: Focus | undefined, viewport: { width: number; height: number }, width: number) {
  if (!focus) return { scale: 1, x: 0, y: 0 };
  const ratio = width / viewport.width;
  const height = viewport.height * ratio;
  const scale = Math.max(1, Math.min(1.14, (width - 48) / (focus.width * ratio), (height - 48) / (focus.height * ratio)));
  const x = (width / 2 - (focus.x + focus.width / 2) * ratio) * scale;
  const y = (height / 2 - (focus.y + focus.height / 2) * ratio) * scale;
  const limitX = width * (scale - 1) / 2;
  const limitY = height * (scale - 1) / 2;
  return { scale, x: Math.max(-limitX, Math.min(limitX, x)), y: Math.max(-limitY, Math.min(limitY, y)) };
}
