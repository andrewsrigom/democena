import type { Scene } from './model.js';
export const FPS: 30;
export const DEFAULT_TRANSITION: { readonly type: 'fade'; readonly duration: 0.4 };
export function frames(seconds: number, fps: number): number;
export function transitionFrames(scene: Scene, fps: number): number;
export function buildTimeline(scenes: Scene[], fps: number): Array<{
  scene: Scene; from: number; duration: number; overlap: number; end: number; previewFrame: number;
}>;
export function settledReviewFrame(
  entry: { from: number; duration: number; overlap: number; end: number; previewFrame: number },
  nextFrom: number | undefined,
  requestedLocalSeconds: number | undefined,
  fps: number,
): number;
