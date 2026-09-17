import type { Project, Transition } from './model.js';

export const transitionPhases: readonly ['before', 'midpoint', 'after'];
export type TransitionPhase = (typeof transitionPhases)[number];
export type TransitionMatrixFrames = Record<TransitionPhase, number> & { settledCheck: number };
export type TransitionMatrixEntry = {
  id: Transition['type'];
  project: Project;
  fromSceneId: string;
  toSceneId: string;
  durationInFrames: number;
  transitionFrames: number;
  frames: TransitionMatrixFrames;
};
export function transitionMatrixEntry(id: Transition['type'], source: Project, fps?: number): TransitionMatrixEntry;
export function transitionMatrix(source: Project, fps?: number): TransitionMatrixEntry[];
