import type { Focus, Project, Source } from './model.js';
import { captionPlacements, chromeModes, compositionLayouts, compositionRegistry, typographicRoles } from './composition-registry.mjs';
import { cameraFocusFitsVisibleViewport, cameraFocusSupportsMinimumZoom, defaultCameraZoom, minimumCameraZoom } from './camera-geometry.mjs';
import { OUTPUT_CANVAS, productLayout } from './canvas-geometry.mjs';

import { DEFAULT_TRANSITION, FPS, frames } from './timeline-layout.mjs';
export { authoredEntranceOffsetFrames, buildTimeline, chapterLifecycleFrames, DEFAULT_TRANSITION, FPS, frames, settledReviewFrame, titleEntranceFrames, transitionFrames } from './timeline-layout.mjs';

export function sourceFrame(source: Source, localFrame: number, trimBefore: number, fps: number) {
  return frames(trimBefore + source.from, fps) + (source.freeze ? 0 : localFrame);
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid project: ${message}`);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function text(value: unknown): value is string { return typeof value === 'string'; }

/** Upgrade the original three-caption manifest in memory; never overwrite the user's file. */
function migrate(input: Record<string, unknown>): Record<string, unknown> {
  // Remotion merges defaultProps into old --props files before metadata runs.
  const first = Array.isArray(input.scenes) ? input.scenes[0] : undefined;
  const legacyShape = finite(input.duration) && record(first) && first.type === undefined && finite(first.at);
  if (input.version !== undefined && !(input.version === 2 && legacyShape)) return input;
  requireValue(finite(input.duration) && input.duration > 0, 'legacy duration must be positive; new projects need version: 2');
  requireValue(Array.isArray(input.scenes) && input.scenes.length > 0, 'scenes must not be empty');
  const duration = input.duration;
  const old = input.scenes;
  const scenes = old.map((scene: unknown, index: number) => {
    requireValue(record(scene) && finite(scene.at), `legacy scenes[${index}].at is required`);
    const next: unknown = old[index + 1];
    const end = record(next) && finite(next.at) ? next.at : duration;
    requireValue((index !== 0 || scene.at === 0) && end > scene.at && end <= duration, 'legacy scene times must increase from zero within duration');
    return { ...scene, id: `scene-${index + 1}`, type: scene.focus ? 'focus' : 'overview',
      duration: end - scene.at, source: { from: scene.at }, transition: { type: 'none', duration: 0 } };
  });
  return { ...input, version: 2, sourceDuration: finite(input.sourceDuration) && input.sourceDuration > 0 ? input.sourceDuration : duration + (finite(input.trimBefore) ? input.trimBefore : 0), scenes };
}

/** Shared by Studio metadata and export, before any scene reaches a component. */
export function prepareProject(value: unknown, fps = FPS): Project {
  requireValue(record(value), 'expected an object');
  const p = migrate(value);
  requireValue(p.version === 2, 'unsupported version (expected 2)');
  requireValue(text(p.title) && text(p.video) && /^#[0-9a-f]{6}$/i.test(String(p.accent)), 'title, video and a six-digit accent color are required');
  requireValue(!p.video.startsWith('/') && !p.video.includes('\\') && !p.video.includes(':') && !p.video.split('/').includes('..'), 'video must be a relative path inside public');
  if (p.branding !== undefined) {
    requireValue(record(p.branding), 'branding must be an object');
    const limits = { name: 80, tagline: 120, footer: 160 } as const;
    for (const [key, limit] of Object.entries(limits)) {
      const value = p.branding[key];
      requireValue(value === undefined || (text(value) && value.length > 0 && value.length <= limit), `branding.${key} must contain 1-${limit} characters`);
    }
    const logo = p.branding.logo;
    requireValue(logo === undefined || (text(logo) && /^(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(logo)), 'branding.logo must be a relative PNG, JPEG or WebP path inside public');
  }
  if (p.appearance !== undefined) {
    requireValue(record(p.appearance), 'appearance must be an object');
    requireValue(p.appearance.surfaceMode === undefined || ['light', 'dark', 'auto'].includes(String(p.appearance.surfaceMode)), 'appearance.surfaceMode must be light, dark or auto');
    for (const key of ['background', 'foreground', 'muted', 'surface', 'border', 'tint']) {
      const value = p.appearance[key];
      requireValue(value === undefined || (text(value) && /^#[0-9a-f]{6}$/i.test(value)), `appearance.${key} must be a six-digit hex color`);
    }
    requireValue(p.appearance.fontFamily === undefined || (text(p.appearance.fontFamily) && p.appearance.fontFamily.length > 0 && p.appearance.fontFamily.length <= 200), 'appearance.fontFamily must contain 1-200 characters');
    requireValue(p.appearance.radius === undefined || (finite(p.appearance.radius) && p.appearance.radius >= 0 && p.appearance.radius <= 40), 'appearance.radius must be between 0 and 40');
  }
  requireValue(finite(p.sourceDuration) && p.sourceDuration >= 0 && finite(p.trimBefore) && p.trimBefore >= 0 && p.trimBefore <= p.sourceDuration, 'invalid sourceDuration or trimBefore');
  requireValue(record(p.viewport) && finite(p.viewport.width) && p.viewport.width > 0 && finite(p.viewport.height) && p.viewport.height > 0, 'viewport must be positive');
  requireValue(Array.isArray(p.scenes) && p.scenes.length > 0, 'scenes must not be empty');
  const viewport = p.viewport;
  const sourceDuration = p.sourceDuration;
  const trim = p.trimBefore;
  const ids = new Set<string>();
  const rect = (value: unknown, name: string) => {
    requireValue(record(value) && finite(value.x) && finite(value.y) && finite(value.width) && finite(value.height), `${name} needs x, y, width, height`);
    requireValue(value.x >= 0 && value.y >= 0 && value.width > 0 && value.height > 0 && value.x + value.width <= Number(viewport.width) + 0.01 && value.y + value.height <= Number(viewport.height) + 0.01, `${name} must fit the recorded viewport`);
  };
  const clip = (value: unknown, duration: number, name: string) => {
    requireValue(record(value) && finite(value.from) && value.from >= 0 && (value.freeze === undefined || typeof value.freeze === 'boolean'), `${name} needs a nonnegative from and optional boolean freeze`);
    const last = frames(trim + value.from, fps) + (value.freeze ? 0 : frames(duration, fps) - 1);
    requireValue(last / fps < sourceDuration, `${name} runs beyond the recording; shorten duration or use freeze: true`);
  };
  const zoom = (value: unknown, name: string) => requireValue(value === undefined || (finite(value) && value >= 1 && value <= 3), `${name} must be between 1 and 3`);
  for (const [i, scene] of p.scenes.entries()) {
    const name = `scenes[${i}]`;
    requireValue(record(scene), `${name} must be an object`);
    requireValue(text(scene.id) && scene.id.length > 0 && !ids.has(scene.id), `${name}.id must be nonempty and unique`);
    ids.add(scene.id);
    requireValue(finite(scene.duration) && frames(scene.duration, fps) >= 1, `${name}.duration must cover at least one frame`);
    for (const key of ['eyebrow', 'title', 'body']) requireValue(text(scene[key]), `${name}.${key} is required`);
    requireValue(scene.chrome === undefined || chromeModes.includes(scene.chrome as typeof chromeModes[number]), `${name}.chrome is invalid`);
    requireValue(scene.typographicRole === undefined || typographicRoles.includes(scene.typographicRole as typeof typographicRoles[number]), `${name}.typographicRole is invalid`);
    const transition = scene.transition ?? DEFAULT_TRANSITION;
    requireValue(record(transition) && ['fade', 'slide', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'none'].includes(String(transition.type)) && finite(transition.duration) && transition.duration >= 0, `${name}.transition is invalid`);
    const incoming = i === 0 || transition.type === 'none' ? 0 : frames(transition.duration, fps);
    const previous = p.scenes[i - 1];
    requireValue(incoming * 2 < frames(scene.duration, fps) && (!previous || incoming * 2 < frames(Number(previous.duration), fps)), `${name}.transition must be shorter than half of both adjacent scenes`);
    const productScene = !['text', 'chapter', 'outro'].includes(String(scene.type));
    requireValue(productScene || scene.presentation === undefined, `${name}.presentation is only available on product scenes`);
    if (productScene && scene.presentation !== undefined) {
      requireValue(record(scene.presentation), `${name}.presentation must be an object`);
      requireValue(scene.presentation.layout === undefined || compositionLayouts.includes(scene.presentation.layout as typeof compositionLayouts[number]), `${name}.presentation.layout is invalid`);
      requireValue(scene.presentation.caption === undefined || captionPlacements.includes(scene.presentation.caption as typeof captionPlacements[number]), `${name}.presentation.caption is invalid`);
      requireValue(scene.presentation.caption !== 'side' || ['framed', 'detail-crop'].includes(String(scene.presentation.layout ?? 'framed')), `${name}.presentation.caption side requires the framed or detail-crop layout`);
      const layout = String(scene.presentation.layout ?? 'framed') as keyof typeof compositionRegistry;
      const definition = compositionRegistry[layout];
      requireValue(definition !== undefined && (!definition.requiresFocus || (record(scene.focus) && finite(scene.focus.x))), `${name}.presentation.layout ${layout} requires an evidence-linked focus rectangle`);
      const minimumZoom = minimumCameraZoom(layout);
      if (scene.type === 'focus' && scene.zoom !== undefined) {
        requireValue(finite(scene.zoom) && scene.zoom >= minimumZoom, `${name}.zoom must be at least ${minimumZoom} for the ${layout} layout`);
      }
      requireValue(scene.type !== 'result' || scene.comparison === undefined, `${name}.presentation is not available on comparison results`);
      const recordedViewport = { width: Number(viewport.width), height: Number(viewport.height) };
      const primaryWidth = productLayout(layout, recordedViewport, OUTPUT_CANVAS).primary.width;
      const visibleViewport = definition.immersive ? OUTPUT_CANVAS : undefined;
      const focuses: Array<{ focus: Focus; pathIndex?: number; zoom: number }> = [];
      const usableFocus = (value: unknown): value is Focus => record(value) && finite(value.x) && finite(value.y) && finite(value.width) && finite(value.height);
      if (scene.type === 'camera' && Array.isArray(scene.path)) scene.path.forEach((stop, pathIndex) => {
        if (record(stop) && usableFocus(stop.focus)) focuses.push({ focus: stop.focus, pathIndex, zoom: finite(stop.zoom) ? stop.zoom : 1.8 });
      });
      else if (usableFocus(scene.focus) && (scene.type !== 'annotation' || definition.requiresFocus)) {
        const defaultZoom = defaultCameraZoom(layout, scene.type === 'focus');
        focuses.push({ focus: scene.focus, zoom: scene.type === 'focus' && finite(scene.zoom) ? scene.zoom : defaultZoom });
      }
      for (const candidate of focuses) {
        const focusName = `${name}${candidate.pathIndex === undefined ? '' : `.path[${candidate.pathIndex}]`}.focus`;
        if (visibleViewport) requireValue(cameraFocusFitsVisibleViewport(candidate.focus, recordedViewport, primaryWidth, visibleViewport), `${focusName} cannot fit the visible canvas`);
        requireValue(cameraFocusSupportsMinimumZoom(candidate.focus, recordedViewport, primaryWidth, candidate.zoom, minimumZoom, visibleViewport), `${focusName} cannot preserve the required ${minimumZoom}x zoom for the ${layout} layout`);
      }
    }
    requireValue(scene.typographicRole !== 'silent-product' || productScene, `${name}.typographicRole silent-product is only available on product scenes`);
    requireValue(scene.typographicRole !== 'silent-product' || !record(scene.presentation) || scene.presentation.caption === undefined || scene.presentation.caption === 'none', `${name}.typographicRole silent-product cannot render a caption`);
    switch (scene.type) {
      case 'text': case 'outro':
        requireValue(scene.reveal === undefined || scene.reveal === 'words' || scene.reveal === 'lines', `${name}.reveal must be words or lines`);
        requireValue(scene.highlight === undefined || (text(scene.highlight) && scene.highlight.length > 0 && !scene.highlight.includes('\n') && String(scene.title).includes(scene.highlight)), `${name}.highlight must appear within one title line`);
        requireValue(scene.cta === undefined || text(scene.cta), `${name}.cta must be text`);
        break;
      case 'chapter': requireValue(text(scene.number), `${name}.number is required`); break;
      case 'overview': clip(scene.source, scene.duration, `${name}.source`); break;
      case 'focus':
        clip(scene.source, scene.duration, `${name}.source`); rect(scene.focus, `${name}.focus`); zoom(scene.zoom, `${name}.zoom`);
        requireValue(scene.dim === undefined || (finite(scene.dim) && scene.dim >= 0 && scene.dim <= 0.85), `${name}.dim must be between 0 and 0.85`);
        break;
      case 'camera': {
        clip(scene.source, scene.duration, `${name}.source`);
        requireValue(Array.isArray(scene.path) && scene.path.length >= 2, `${name}.path needs at least two stops`);
        let previousAt = -1;
        for (const [j, stop] of scene.path.entries()) {
          requireValue(record(stop) && finite(stop.at) && stop.at > previousAt && stop.at < scene.duration && (j !== 0 || stop.at === 0), `${name}.path times must increase from zero within duration`);
          // Distinct seconds can still round onto the same frame.
          requireValue(j === 0 || frames(stop.at, fps) > frames(previousAt, fps), `${name}.path stops need distinct frames`);
          previousAt = stop.at;
          if (stop.focus !== undefined) rect(stop.focus, `${name}.path[${j}].focus`);
          zoom(stop.zoom, `${name}.path[${j}].zoom`);
        }
        break;
      }
      case 'annotation':
        clip(scene.source, scene.duration, `${name}.source`);
        requireValue(record(scene.source) && scene.source.freeze === true, `${name}.source must freeze for an annotation`);
        rect(scene.focus, `${name}.focus`);
        requireValue(record(scene.note) && text(scene.note.text) && finite(scene.note.x) && finite(scene.note.y) && finite(scene.note.width), `${name}.note needs text, x, y and width`);
        requireValue(scene.note.x >= 0 && scene.note.y >= 0 && scene.note.width >= 180 && scene.note.x + scene.note.width <= Number(viewport.width) && scene.note.y + 140 <= Number(viewport.height), `${name}.note must fit the viewport with 140px of vertical space`);
        break;
      case 'result':
        clip(scene.source, scene.duration, `${name}.source`);
        if (scene.focus !== undefined) rect(scene.focus, `${name}.focus`);
        if (scene.comparison !== undefined) {
          requireValue(record(scene.comparison), `${name}.comparison must be an object`);
          const c = scene.comparison;
          clip({ from: c.before, freeze: true }, 1, `${name}.comparison.before`);
          clip({ from: c.after, freeze: true }, 1, `${name}.comparison.after`);
          rect(c.crop, `${name}.comparison.crop`);
          requireValue(text(c.beforeLabel) && text(c.afterLabel), `${name}.comparison labels are required`);
        }
        break;
      default: throw new Error(`Invalid project: ${name}.type is unknown: ${String(scene.type)}`);
    }
  }
  return p as unknown as Project;
}
