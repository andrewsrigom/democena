const fixtureProject = 'examples/motion-registry/project.json';
const fixturePair = (fromSceneId, toSceneId) => ({ project: fixtureProject, fromSceneId, toSceneId });

export const transitionRegistry = {
  none: { id: 'none', implementation: { kind: 'cut' }, purpose: 'Cut directly without overlapping visual motion.', fixture: fixturePair('opening', 'cut-text'), fallback: 'none' },
  fade: { id: 'fade', implementation: { kind: 'fade' }, purpose: 'Blend neighboring scenes without adding directional velocity.', fixture: fixturePair('overview', 'focus'), fallback: 'none' },
  slide: { id: 'slide', implementation: { kind: 'translate', axis: 'y', direction: 1, distance: 36, unit: 'px', fade: true }, purpose: 'Lift content subtly while fading it into the current composition.', fixture: fixturePair('cut-text', 'chapter'), fallback: 'fade' },
  'slide-up': { id: 'slide-up', implementation: { kind: 'translate', axis: 'y', direction: 1, distance: 100, unit: '%', fade: false }, purpose: 'Cover the outgoing scene from below for a strong upward advance.', fixture: fixturePair('camera', 'annotation'), fallback: 'fade' },
  'slide-down': { id: 'slide-down', implementation: { kind: 'translate', axis: 'y', direction: -1, distance: 100, unit: '%', fade: false }, purpose: 'Cover the outgoing scene from above for a downward reveal.', fixture: fixturePair('annotation', 'comparison'), fallback: 'fade' },
  'slide-left': { id: 'slide-left', implementation: { kind: 'translate', axis: 'x', direction: 1, distance: 100, unit: '%', fade: false }, purpose: 'Advance horizontally while preserving leftward reading momentum.', fixture: fixturePair('chapter', 'overview'), fallback: 'fade' },
  'slide-right': { id: 'slide-right', implementation: { kind: 'translate', axis: 'x', direction: -1, distance: 100, unit: '%', fade: false }, purpose: 'Return horizontally while preserving rightward reading momentum.', fixture: fixturePair('focus', 'camera'), fallback: 'fade' },
};

export function transitionStyleFor(type, enter) {
  const implementation = transitionRegistry[type].implementation;
  if (implementation.kind === 'cut') return { opacity: 1 };
  if (implementation.kind === 'fade') return { opacity: enter };
  const offset = (1 - enter) * implementation.direction * implementation.distance;
  const transform = implementation.axis === 'x' ? `translateX(${offset}${implementation.unit})` : `translateY(${offset}${implementation.unit})`;
  return { opacity: implementation.fade ? enter : 1, transform };
}
