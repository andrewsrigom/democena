import type { Focus } from './model.js';

export function cameraFocusFitsVisibleViewport(
  focus: Focus,
  viewport: { width: number; height: number },
  width: number,
  visibleViewport: { width: number; height: number },
): boolean;
