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

/** Mirror AnimatedTitle tokenization so review frames include every delayed title entrance. */
export function animatedTitleLines(text, highlight, reveal = 'words') {
  let wordIndex = 0;
  return text.split('\n').map((line, lineIndex) => {
    const parts = highlight && line.includes(highlight)
      ? line.split(highlight).flatMap((part, index) => index === 0
        ? [{ text: part, marked: false }]
        : [{ text: highlight, marked: true }, { text: part, marked: false }])
      : [{ text: line, marked: false }];
    const tokens = parts.flatMap((part) => part.marked
      ? [part]
      : part.text.split(/(\s+)/).filter(Boolean).map((token) => ({ text: token, marked: false })));
    return tokens.map((token) => {
      if (/^\s+$/.test(token.text)) return token;
      const delay = reveal === 'lines' ? lineIndex * 9 : wordIndex++ * 3;
      return { ...token, delay };
    });
  });
}

export function titleEntranceFrames(scene, fps) {
  if (!['text', 'chapter', 'outro'].includes(scene.type)) return frames(1.5, fps);
  const reveal = scene.type === 'chapter' ? 'lines' : (scene.reveal ?? 'words');
  const tokens = animatedTitleLines(scene.title, scene.highlight, reveal).flat().filter((token) => token.delay !== undefined);
  const latestStart = tokens.reduce((latest, token) => Math.max(latest, token.delay + (token.marked ? 17 : 4)), 0);
  return Math.max(frames(1.5, fps), latestStart + frames(0.6, fps));
}

/** Hard cuts can skip authored entrances without advancing duration-based scene lifecycles. */
export function authoredEntranceOffsetFrames(scene, fps, first) {
  if (first || scene.transition?.type !== 'none' || !['text', 'chapter', 'outro'].includes(scene.type)) return 0;
  return titleEntranceFrames(scene, fps);
}

/** Keep the chapter hero readable after its entrance, even when the authored scene is short. */
export function chapterLifecycleFrames(scene, fps, incomingOverlapFrames = 0) {
  const sceneFrames = Math.max(1, frames(scene.duration, fps));
  const entranceEnd = titleEntranceFrames(scene, fps);
  const readableHold = Math.max(1, frames(.25, fps));
  const demotionStart = Math.max(Math.floor(sceneFrames * .5), entranceEnd + readableHold, incomingOverlapFrames + readableHold);
  const demotionEnd = Math.max(demotionStart + 1, Math.floor(sceneFrames * .8));
  return { sceneFrames, entranceEnd, demotionStart, demotionEnd };
}

/** Keep review artifacts beyond transitions and the latest delayed content entrance. */
export function settledReviewFrame(entry, nextFrom, requestedLocalSeconds, fps) {
  const sceneEnd = nextFrom ?? entry.end;
  const sceneLast = Math.max(entry.from, sceneEnd - 1);
  const requestedEntranceEnd = entry.from + Math.max(entry.overlap, titleEntranceFrames(entry.scene, fps));
  const entranceEnd = Math.min(sceneLast, requestedEntranceEnd);
  const settledEnd = entry.scene.type === 'chapter'
    ? Math.min(sceneEnd, entry.from + chapterLifecycleFrames(entry.scene, fps, entry.overlap).demotionStart)
    : sceneEnd;
  const settledLast = Math.max(entry.from, settledEnd - 1);
  const defaultRequested = entry.scene.type === 'chapter'
    ? Math.floor((entranceEnd + settledEnd - 1) / 2)
    : entry.previewFrame;
  const requested = requestedLocalSeconds === undefined ? defaultRequested : entry.from + frames(requestedLocalSeconds, fps);
  return Math.min(settledLast, Math.max(entranceEnd, requested));
}
