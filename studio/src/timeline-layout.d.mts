import type { ChapterScene, Scene } from './model.js';
export const FPS: 30;
export const DEFAULT_TRANSITION: { readonly type: 'fade'; readonly duration: 0.4 };
export function frames(seconds: number, fps: number): number;
export function transitionFrames(scene: Scene, fps: number): number;
export function buildTimeline(scenes: Scene[], fps: number): Array<{
  scene: Scene; from: number; duration: number; overlap: number; end: number; previewFrame: number;
}>;
export function animatedTitleLines(
  text: string,
  highlight: string | undefined,
  reveal?: 'words' | 'lines',
): Array<Array<{ text: string; marked: boolean; delay?: number }>>;
export function titleEntranceFrames(scene: Scene, fps: number): number;
export function authoredEntranceOffsetFrames(scene: Scene, fps: number, first: boolean): number;
export function chapterLifecycleFrames(scene: ChapterScene, fps: number): {
  sceneFrames: number; entranceEnd: number; demotionStart: number; demotionEnd: number;
};
export function settledReviewFrame(
  entry: { scene: Scene; from: number; duration: number; overlap: number; end: number; previewFrame: number },
  nextFrom: number | undefined,
  requestedLocalSeconds: number | undefined,
  fps: number,
): number;
