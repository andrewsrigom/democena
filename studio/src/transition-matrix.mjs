import { transitionRegistry } from './transition-registry.mjs';
import { buildTimeline, FPS, settledReviewFrame } from './timeline-layout.mjs';

export const transitionPhases = ['before', 'midpoint', 'after'];

export function transitionMatrixEntry(id, source, fps = FPS) {
  const definition = transitionRegistry[id];
  const fromIndex = source.scenes.findIndex((scene) => scene.id === definition.fixture.fromSceneId);
  const toIndex = source.scenes.findIndex((scene) => scene.id === definition.fixture.toSceneId);
  if (fromIndex < 0 || toIndex !== fromIndex + 1) throw new Error(`Transition fixture pair is invalid for ${id}.`);
  const from = source.scenes[fromIndex];
  const to = source.scenes[toIndex];
  const project = {
    ...source,
    scenes: [
      { ...from, transition: { type: 'none', duration: 0 } },
      { ...to, transition: { type: id, duration: id === 'none' ? 0 : to.transition?.duration ?? .4 } },
    ],
  };
  const timeline = buildTimeline(project.scenes, fps);
  const incoming = timeline[1];
  const durationInFrames = incoming.end;
  const before = Math.max(timeline[0].from, incoming.from - 1);
  const midpoint = incoming.overlap === 0 ? incoming.from : incoming.from + Math.floor((incoming.overlap - 1) / 2);
  const after = settledReviewFrame(incoming, undefined, undefined, fps);
  const settledCheck = Math.min(incoming.end - 1, after + Math.max(1, Math.round(fps * .2)));
  return {
    id,
    project,
    fromSceneId: from.id,
    toSceneId: to.id,
    durationInFrames,
    transitionFrames: incoming.overlap,
    frames: { before, midpoint, after, settledCheck },
  };
}

export function transitionMatrix(source, fps = FPS) {
  return Object.keys(transitionRegistry).map((id) => transitionMatrixEntry(id, source, fps));
}
