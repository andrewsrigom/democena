// Shared by Remotion and the Node export script; no React or browser dependency.
export const FPS = 30;
export const DEFAULT_TRANSITION = { type: 'fade', duration: 0.4 };
export const frames = (seconds, fps) => Math.round(seconds * fps);
export function transitionFrames(scene, fps) {
  const transition = scene.transition ?? DEFAULT_TRANSITION;
  return transition.type === 'none' ? 0 : frames(transition.duration, fps);
}

/** Durations include the incoming crossfade. Source time never uses timeline time. */
export function buildTimeline(scenes, fps) {
  let end = 0;
  const timeline = scenes.map((scene, index) => {
    const duration = frames(scene.duration, fps);
    const overlap = index === 0 ? 0 : transitionFrames(scene, fps);
    const from = end - overlap;
    end = from + duration;
    return { scene, from, duration, overlap, end };
  });
  return timeline.map((entry, index) => {
    const settledStart = entry.from + entry.overlap;
    const settledEnd = timeline[index + 1]?.from ?? entry.end;
    // A thumbnail belongs to this scene, not the following crossfade.
    const previewFrame = Math.floor((settledStart + settledEnd - 1) / 2);
    return { ...entry, previewFrame };
  });
}

/** Keep review artifacts beyond transitions and the latest delayed content entrance. */
export function settledReviewFrame(entry, nextFrom, requestedLocalSeconds, fps) {
  const settledEnd = nextFrom ?? entry.end;
  const requested = requestedLocalSeconds === undefined ? entry.previewFrame : entry.from + frames(requestedLocalSeconds, fps);
  const entranceEnd = entry.from + Math.max(entry.overlap, frames(1.5, fps));
  return Math.min(settledEnd - 1, Math.max(entranceEnd, requested));
}
