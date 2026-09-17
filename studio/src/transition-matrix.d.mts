import type { Project, Transition } from './model.js';

export const transitionPhases: readonly ['before', 'midpoint', 'after'];
export type TransitionPhase = (typeof transitionPhases)[number];
export type TransitionMatrixFrames = Record<TransitionPhase, number> & { settledCheck: number };
export type TransitionMatrixEntry = {
  id: Transition['type'];
  kind: 'transition';
  project: Project;
  fromSceneId: string;
  toSceneId: string;
  durationInFrames: number;
  transitionFrames: number;
  frames: TransitionMatrixFrames;
  destinationProject: Project;
  destinationReferenceFrame: number;
};
export type ChromeMatrixEntry = Omit<TransitionMatrixEntry, 'id' | 'kind'> & {
  id: 'chrome-framed-to-full-bleed' | 'chrome-full-bleed-to-framed' | 'chrome-full-bleed-to-full-bleed';
  kind: 'chrome';
  expectedChrome: Record<TransitionPhase, boolean>;
};
export function transitionMatrixEntry(id: Transition['type'], source: Project, fps?: number): TransitionMatrixEntry;
export function transitionMatrix(source: Project, fps?: number): TransitionMatrixEntry[];
export function chromeMatrix(source: Project, fps?: number): ChromeMatrixEntry[];
