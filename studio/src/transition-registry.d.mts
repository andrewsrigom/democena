import type { Transition } from './model.js';

export type TransitionImplementation =
  | { kind: 'cut' }
  | { kind: 'fade' }
  | { kind: 'translate'; axis: 'x' | 'y'; direction: -1 | 1; distance: number; unit: 'px' | '%'; fade: boolean };
export type TransitionFixture = { project: string; fromSceneId: string; toSceneId: string };
export type TransitionDefinition = { id: Transition['type']; implementation: TransitionImplementation; purpose: string; fixture: TransitionFixture; fallback: Transition['type'] };
export const transitionRegistry: Record<Transition['type'], TransitionDefinition>;
export function transitionStyleFor(type: Transition['type'], enter: number): { opacity: number; transform?: string };
