import type { CameraStop, Focus } from './model.js';
import { cameraFocusFitsVisibleViewport, fittedCameraScale } from './camera-geometry.mjs';

export { cameraFocusFitsVisibleViewport, cameraFocusSupportsMinimumZoom, fittedCameraScale } from './camera-geometry.mjs';

export type Camera = { scale: number; x: number; y: number };
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
/** Translation is relative to CSS's center transform origin. Never expose empty canvas. */
export function cameraFor(
  focus: Focus | undefined,
  viewport: { width: number; height: number },
  width: number,
  zoom = 1.14,
  visibleViewport?: { width: number; height: number },
  minimumZoom = 1,
): Camera {
  if (!focus) return { scale: 1, x: 0, y: 0 };
  const ratio = width / viewport.width;
  const height = viewport.height * ratio;
  const visibleWidth = Math.min(width, visibleViewport?.width ?? width);
  const visibleHeight = Math.min(height, visibleViewport?.height ?? height);
  if (visibleViewport && !cameraFocusFitsVisibleViewport(focus, viewport, width, visibleViewport)) {
    throw new Error('Camera focus cannot fit the visible viewport without exposing empty canvas.');
  }
  const scale = fittedCameraScale(focus, viewport, width, zoom, visibleViewport);
  if (scale + 1e-9 < minimumZoom) throw new Error(`Camera focus cannot preserve the required ${minimumZoom}x zoom.`);
  return { scale, x: clamp((width / 2 - (focus.x + focus.width / 2) * ratio) * scale, (width * scale - visibleWidth) / 2),
    y: clamp((height / 2 - (focus.y + focus.height / 2) * ratio) * scale, (height * scale - visibleHeight) / 2) };
}

/** Map source-video coordinates into the rendered camera viewport. */
export function cameraPoint(point: { x: number; y: number }, viewport: { width: number; height: number }, width: number, camera: Camera) {
  const ratio = width / viewport.width;
  const height = viewport.height * ratio;
  return {
    x: width / 2 + (point.x * ratio - width / 2) * camera.scale + camera.x,
    y: height / 2 + (point.y * ratio - height / 2) * camera.scale + camera.y,
  };
}

/** Ease between stops, then hold the final target. An absent focus restores the overview. */
export function cameraAt(path: CameraStop[], time: number, viewport: { width: number; height: number }, width: number, visibleViewport?: { width: number; height: number }, minimumZoom = 1): Camera {
  const first = path[0];
  if (!first) return cameraFor(undefined, viewport, width, undefined, visibleViewport);
  let before = first;
  let after = first;
  for (const stop of path) {
    after = stop;
    if (stop.at >= time) break;
    before = stop;
  }
  const a = cameraFor(before.focus, viewport, width, before.zoom ?? 1.8, visibleViewport, minimumZoom);
  const b = cameraFor(after.focus, viewport, width, after.zoom ?? 1.8, visibleViewport, minimumZoom);
  const fraction = before.at === after.at ? 1 : Math.max(0, Math.min(1, (time - before.at) / (after.at - before.at)));
  const t = fraction * fraction * (3 - 2 * fraction);
  return { scale: a.scale + (b.scale - a.scale) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
