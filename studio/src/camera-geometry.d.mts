import type { Focus } from './model.js';
import type { CompositionLayout } from './model.js';

export function cameraFocusFitsVisibleViewport(
  focus: Focus,
  viewport: { width: number; height: number },
  width: number,
  visibleViewport: { width: number; height: number },
): boolean;
export function fittedCameraScale(
  focus: Focus,
  viewport: { width: number; height: number },
  width: number,
  zoom: number,
  visibleViewport?: { width: number; height: number },
): number;
export function cameraFocusSupportsMinimumZoom(
  focus: Focus,
  viewport: { width: number; height: number },
  width: number,
  zoom: number,
  minimumZoom: number,
  visibleViewport?: { width: number; height: number },
): boolean;
export function minimumCameraZoom(layout: CompositionLayout): number;
export function defaultCameraZoom(layout: CompositionLayout, focusScene: boolean): number;
