import type { CameraStop, Focus } from './model.js';

export type Camera = { scale: number; x: number; y: number };
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
/** Translation is relative to CSS's center transform origin. Never expose empty canvas. */
export function cameraFor(focus: Focus | undefined, viewport: { width: number; height: number }, width: number, zoom = 1.14): Camera {
  if (!focus) return { scale: 1, x: 0, y: 0 };
  const ratio = width / viewport.width;
  const height = viewport.height * ratio;
  const scale = Math.max(1, Math.min(zoom, (width - 48) / (focus.width * ratio), (height - 48) / (focus.height * ratio)));
  return { scale, x: clamp((width / 2 - (focus.x + focus.width / 2) * ratio) * scale, width * (scale - 1) / 2),
    y: clamp((height / 2 - (focus.y + focus.height / 2) * ratio) * scale, height * (scale - 1) / 2) };
}

/** Ease between stops, then hold the final target. An absent focus restores the overview. */
export function cameraAt(path: CameraStop[], time: number, viewport: { width: number; height: number }, width: number): Camera {
  const first = path[0];
  if (!first) return cameraFor(undefined, viewport, width);
  let before = first;
  let after = first;
  for (const stop of path) {
    after = stop;
    if (stop.at >= time) break;
    before = stop;
  }
  const a = cameraFor(before.focus, viewport, width, before.zoom ?? 1.8);
  const b = cameraFor(after.focus, viewport, width, after.zoom ?? 1.8);
  const fraction = before.at === after.at ? 1 : Math.max(0, Math.min(1, (time - before.at) / (after.at - before.at)));
  const t = fraction * fraction * (3 - 2 * fraction);
  return { scale: a.scale + (b.scale - a.scale) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
