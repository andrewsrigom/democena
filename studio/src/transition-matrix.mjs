import { transitionRegistry } from './transition-registry.mjs';
import { buildTimeline, FPS, settledReviewFrame } from './timeline-layout.mjs';

export const transitionPhases = ['before', 'midpoint', 'after'];

function matrixEntry(id, source, from, to, transition, fps, extra = {}) {
  const project = {
    ...source,
    scenes: [
      { ...from, transition: { type: 'none', duration: 0 } },
      { ...to, transition },
    ],
  };
  const timeline = buildTimeline(project.scenes, fps);
  const incoming = timeline[1];
  const durationInFrames = incoming.end;
  const before = Math.max(timeline[0].from, incoming.from - 1);
  const midpoint = incoming.overlap === 0 ? incoming.from : incoming.from + Math.floor((incoming.overlap - 1) / 2);
  const after = settledReviewFrame(incoming, undefined, undefined, fps);
  const settledCheck = Math.min(incoming.end - 1, after + Math.max(1, Math.round(fps * .2)));
  const destinationProject = {
    ...project,
    scenes: [project.scenes[0], { ...project.scenes[1], transition: { type: 'none', duration: 0 } }],
  };
  const destinationTimeline = buildTimeline(destinationProject.scenes, fps);
  const destinationIncoming = destinationTimeline[1];
  const destinationReferenceFrame = Math.min(
    destinationIncoming.end - 1,
    destinationIncoming.from + (after - incoming.from),
  );
  return {
    id,
    kind: 'transition',
    project,
    fromSceneId: from.id,
    toSceneId: to.id,
    durationInFrames,
    transitionFrames: incoming.overlap,
    frames: { before, midpoint, after, settledCheck },
    destinationProject,
    destinationReferenceFrame,
    ...extra,
  };
}

export function transitionMatrixEntry(id, source, fps = FPS) {
  const definition = transitionRegistry[id];
  const fromIndex = source.scenes.findIndex((scene) => scene.id === definition.fixture.fromSceneId);
  const toIndex = source.scenes.findIndex((scene) => scene.id === definition.fixture.toSceneId);
  if (fromIndex < 0 || toIndex !== fromIndex + 1) throw new Error(`Transition fixture pair is invalid for ${id}.`);
  const from = source.scenes[fromIndex];
  const to = source.scenes[toIndex];
  return matrixEntry(id, source, from, to, { type: id, duration: id === 'none' ? 0 : to.transition?.duration ?? .4 }, fps);
}

export function transitionMatrix(source, fps = FPS) {
  return Object.keys(transitionRegistry).map((id) => transitionMatrixEntry(id, source, fps));
}

function productScene(source, id) {
  const scene = source.scenes.find((candidate) => candidate.id === id);
  if (!scene || ['text', 'chapter', 'outro'].includes(scene.type) || (scene.type === 'result' && scene.comparison)) {
    throw new Error(`Chrome fixture scene ${id} must be a non-comparison product scene.`);
  }
  return scene;
}

function withLayout(scene, layout) {
  return {
    ...scene,
    presentation: { ...scene.presentation, layout, caption: layout === 'full-bleed' ? 'bottom-right' : 'side' },
  };
}

/** Exercise every presentation-chrome visibility handoff independently from the transition catalog. */
export function chromeMatrix(source, fps = FPS) {
  const overview = productScene(source, 'overview');
  const focus = productScene(source, 'focus');
  const camera = productScene(source, 'camera');
  const cases = [
    { id: 'chrome-framed-to-full-bleed', from: withLayout(overview, 'framed'), to: withLayout(focus, 'full-bleed'), expectedChrome: { before: true, midpoint: false, after: false } },
    { id: 'chrome-full-bleed-to-framed', from: withLayout(focus, 'full-bleed'), to: withLayout(camera, 'framed'), expectedChrome: { before: false, midpoint: false, after: true } },
    { id: 'chrome-full-bleed-to-full-bleed', from: withLayout(overview, 'full-bleed'), to: withLayout(focus, 'full-bleed'), expectedChrome: { before: false, midpoint: false, after: false } },
  ];
  return cases.map((entry) => matrixEntry(entry.id, source, entry.from, entry.to, { type: 'fade', duration: .4 }, fps, {
    kind: 'chrome', expectedChrome: entry.expectedChrome,
  }));
}
