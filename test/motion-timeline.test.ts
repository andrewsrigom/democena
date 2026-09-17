import { describe, expect, it } from 'vitest';
import { buildTimeline, FPS, prepareProject, sourceFrame } from '../studio/src/timeline.js';
import { example } from '../studio/src/model.js';
import type { Project, Scene } from '../studio/src/model.js';
import { cameraAt, cameraFor } from '../studio/src/camera.js';
import { fullBleedLayout } from '../studio/src/layout.js';
import { presentationChromeOpacity } from '../studio/src/presentation-chrome.js';

const focus = { x: 100, y: 500, width: 300, height: 44 };
const base = { duration: 4, eyebrow: 'A step', title: 'A clear story', body: 'Details.' };
function project(): Project {
  return { version: 2, title: 'Example', video: 'captures/test.webm', sourceDuration: 20, trimBefore: .5,
    accent: '#28584c', viewport: { width: 1280, height: 800 }, scenes: [
      { ...base, id: 'text', type: 'text', reveal: 'words', highlight: 'story' },
      { ...base, id: 'chapter', type: 'chapter', number: '01' },
      { ...base, id: 'overview', type: 'overview', source: { from: 0 } },
      { ...base, id: 'focus', type: 'focus', source: { from: 4 }, focus },
      { ...base, id: 'camera', type: 'camera', source: { from: 8 }, path: [{ at: 0 }, { at: 1, focus, zoom: 2 }, { at: 3 }] },
      { ...base, id: 'annotation', type: 'annotation', source: { from: 12, freeze: true }, focus, note: { text: 'An explanation.', x: 650, y: 200, width: 400 } },
      { ...base, id: 'result', type: 'result', source: { from: 12, freeze: true }, comparison: { before: 8, after: 12, crop: focus, beforeLabel: 'Before', afterLabel: 'After' } },
      { ...base, id: 'outro', type: 'outro', cta: 'Get started', reveal: 'lines' },
    ] };
}

describe('scene timeline and source clock', () => {
  it('accepts all eight scene types, and calculates an overlap without losing frames', () => {
    const p = prepareProject(project());
    const timeline = buildTimeline(p.scenes, FPS);
    expect(timeline).toHaveLength(8);
    expect(timeline.map((entry) => entry.from)).toEqual([0, 108, 216, 324, 432, 540, 648, 756]);
    expect(timeline.at(-1)?.end).toBe(876);
    for (let frame = 0; frame < 876; frame++) {
      const visible = timeline.filter((entry) => frame >= entry.from && frame < entry.end);
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThanOrEqual(2);
    }
  });

  it('inserting text never advances or shifts the source video clock', () => {
    const p = project();
    const timeline = buildTimeline(p.scenes, FPS);
    const overview = p.scenes[2];
    if (!overview || overview.type !== 'overview') throw new Error('missing fixture');
    expect(timeline[2]?.from).toBe(216);
    expect(sourceFrame(overview.source, 0, p.trimBefore, FPS)).toBe(15);
    expect(sourceFrame(overview.source, 42, p.trimBefore, FPS)).toBe(57);
    expect(sourceFrame({ from: 12, freeze: true }, 0, p.trimBefore, FPS)).toBe(375);
    expect(sourceFrame({ from: 12, freeze: true }, 179, p.trimBefore, FPS)).toBe(375);
  });

  it('supports cuts and sub-second durations using integral frames', () => {
    const scenes: Scene[] = [
      { ...base, id: 'a', type: 'text', duration: .11, transition: { type: 'none', duration: 0 } },
      { ...base, id: 'b', type: 'outro', duration: .17, transition: { type: 'none', duration: 0 } },
    ];
    expect(buildTimeline(scenes, FPS).map(({ from, end }) => [from, end])).toEqual([[0, 3], [3, 8]]);
  });

  it('accepts full-bleed product presentation and directional cover transitions', () => {
    const scenes: Scene[] = [
      { ...base, id: 'opening', type: 'text' },
      { ...base, id: 'product', type: 'overview', source: { from: 0, freeze: true }, presentation: { layout: 'full-bleed', caption: 'bottom-right' }, transition: { type: 'slide-up', duration: .5 } },
      { ...base, id: 'closing', type: 'outro', transition: { type: 'slide-down', duration: .5 } },
    ];
    const prepared = prepareProject({ ...project(), scenes });
    expect(prepared.scenes[1]).toMatchObject({ presentation: { layout: 'full-bleed', caption: 'bottom-right' }, transition: { type: 'slide-up' } });
    expect(fullBleedLayout({ width: 1280, height: 800 }, { width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1200, left: 0, top: -60, chromeHeight: 0 });
  });

  it('keeps presentation chrome hidden between consecutive full-bleed scenes', () => {
    expect(presentationChromeOpacity(true, true, 0)).toBe(0);
    expect(presentationChromeOpacity(true, true, 1)).toBe(0);
    expect(presentationChromeOpacity(true, false, 0)).toBe(1);
    expect(presentationChromeOpacity(true, false, 1)).toBe(0);
    expect(presentationChromeOpacity(false, true, 0)).toBe(0);
    expect(presentationChromeOpacity(false, true, 1)).toBe(1);
  });

  it('migrates old manifests, including merged Remotion defaults, without changing the file object', () => {
    const legacy = { title: 'Legacy', video: 'captures/test.webm', accent: '#28584c', viewport: { width: 1280, height: 800 }, duration: 10, trimBefore: .2,
      scenes: [{ at: 0, eyebrow: 'Start', title: 'Overview', body: '' }, { at: 6, eyebrow: 'Next', title: 'Field', body: '', focus }] };
    for (const input of [legacy, { ...example, ...legacy }]) {
      const p = prepareProject(input);
      expect(p.version).toBe(2);
      expect(p.scenes.map((s) => s.type)).toEqual(['overview', 'focus']);
      expect(buildTimeline(p.scenes, FPS).at(-1)?.end).toBe(300);
    }
    expect(legacy.scenes[1]?.at).toBe(6);
    expect('version' in legacy).toBe(false);
  });

  it('supports a plain final-result scene without a comparison', () => {
    const p = project();
    p.scenes = [{ ...base, id: 'result', type: 'result', source: { from: 12, freeze: true }, focus }];
    expect(prepareProject(p).scenes[0]?.type).toBe('result');
  });

  it('accepts product-derived appearance tokens without changing version 2 projects', () => {
    const p = prepareProject({ ...project(), appearance: { surfaceMode: 'dark', background: '#101828', foreground: '#f8fafc', muted: '#cbd5e1', surface: '#162033', border: '#344054', tint: '#1d2939', fontFamily: 'Inter, sans-serif', radius: 22 } });
    expect(p.appearance).toMatchObject({ surfaceMode: 'dark', background: '#101828', radius: 22 });
    expect(p.version).toBe(2);
  });

  it('rejects invalid appearance tokens', () => {
    for (const appearance of [{ surfaceMode: 'night' }, { background: 'black' }, { radius: 41 }, { fontFamily: '' }]) {
      expect(() => prepareProject({ ...project(), appearance })).toThrow(/appearance/);
    }
  });

  it('rejects invalid product presentation', () => {
    const scene = { ...base, id: 'product', type: 'overview', source: { from: 0, freeze: true } };
    expect(() => prepareProject({ ...project(), scenes: [{ ...scene, presentation: { layout: 'edge-to-edge' } }] })).toThrow(/presentation.layout/);
    expect(() => prepareProject({ ...project(), scenes: [{ ...scene, presentation: { caption: 'center' } }] })).toThrow(/presentation.caption/);
    expect(() => prepareProject({ ...project(), scenes: [{ ...scene, presentation: { layout: 'full-bleed', caption: 'side' } }] })).toThrow(/side requires the framed layout/);
    expect(() => prepareProject({ ...project(), scenes: [{ ...base, id: 'text', type: 'text', presentation: { layout: 'full-bleed' } }] })).toThrow(/only available on product scenes/);
    const comparison = project().scenes[6];
    expect(() => prepareProject({ ...project(), scenes: [{ ...comparison, presentation: { layout: 'full-bleed' } }] })).toThrow(/not available on comparison results/);
  });


  it('selects previews outside both incoming and outgoing transitions', () => {
    const scenes: Scene[] = ['a', 'b', 'c'].map((id) => ({ ...base, id, type: 'text', duration: 5, transition: { type: 'fade', duration: 2.4 } }));
    const timeline = buildTimeline(prepareProject({ ...project(), scenes }).scenes, FPS);
    const middle = timeline[1]!;
    expect(middle.previewFrame).toBeGreaterThanOrEqual(middle.from + middle.overlap);
    expect(middle.previewFrame).toBeLessThan(timeline[2]!.from);
    expect(middle.from + Math.round(middle.duration * .65)).toBeGreaterThanOrEqual(timeline[2]!.from);
  });

  it('does not apply an incoming transition to a single short opening', () => {
    const p = prepareProject({ ...project(), scenes: [{ ...base, id: 'opening', type: 'text', duration: .3 }] });
    const timeline = buildTimeline(p.scenes, FPS);
    expect(timeline[0]).toMatchObject({ from: 0, duration: 9, overlap: 0, end: 9, previewFrame: 4 });
  });

  it('accepts the final partial media frame, but rejects a frame at the exact end', () => {
    const scene = { ...base, id: 'last', type: 'overview', source: { from: 1, freeze: true } };
    expect(() => prepareProject({ ...project(), trimBefore: 0, sourceDuration: 1.02, scenes: [scene] })).not.toThrow();
    expect(() => prepareProject({ ...project(), trimBefore: 0, sourceDuration: 1, scenes: [scene] })).toThrow(/beyond the recording/);
  });

  it('rejects clips and comparison stills beyond the recording', () => {
    for (const scene of [
      { ...base, id: 'bad', type: 'overview', source: { from: 18 } },
      { ...base, id: 'bad', type: 'result', source: { from: 0, freeze: true }, comparison: { before: 0, after: 20, crop: focus, beforeLabel: '', afterLabel: '' } },
    ]) expect(() => prepareProject({ ...project(), scenes: [scene] })).toThrow(/beyond the recording/);
  });

  it('rejects rectangles outside the capture, colliding camera stops and overlapping scene transitions', () => {
    const p = project();
    expect(() => prepareProject({ ...p, scenes: [{ ...base, id: 'bad', type: 'focus', source: { from: 0 }, focus: { ...focus, x: 1200 } }] })).toThrow(/fit the recorded viewport/);
    expect(() => prepareProject({ ...p, scenes: [{ ...base, id: 'bad', type: 'camera', source: { from: 0 }, path: [{ at: 0 }, { at: .001, focus }] }] })).toThrow(/distinct frames/);
    expect(() => prepareProject({ ...p, scenes: [p.scenes[0], { ...base, id: 'bad', type: 'text', transition: { type: 'fade', duration: 2 } }] })).toThrow(/half/);
  });

  it('rejects unpaused annotations, missing fields, duplicate IDs and unknown scene types', () => {
    const p = project();
    const annotation = p.scenes[5];
    expect(() => prepareProject({ ...p, scenes: [{ ...annotation, source: { from: 1 } }] })).toThrow(/must freeze/);
    expect(() => prepareProject({ ...p, scenes: [{ ...base, id: 'bad', type: 'chapter' }] })).toThrow(/number/);
    expect(() => prepareProject({ ...p, scenes: [p.scenes[0], p.scenes[0]] })).toThrow(/unique/);
    expect(() => prepareProject({ ...p, scenes: [{ ...base, id: 'bad', type: 'unknown' }] })).toThrow(/unknown/);
    expect(() => prepareProject({ ...p, video: '../outside.mp4' })).toThrow(/relative path/);
    expect(() => prepareProject({ ...p, scenes: [{ ...base, id: 'bad', type: 'text', title: 'First\nSecond', highlight: 'First\nSecond' }] })).toThrow(/one title line/);
  });
});

describe('camera path', () => {
  it('visits the input, then the button and returns to the overview', () => {
    const viewport = { width: 1280, height: 800 };
    const button = { x: 900, y: 500, width: 120, height: 44 };
    const path = [{ at: 0 }, { at: 1, focus, zoom: 2 }, { at: 3, focus: button, zoom: 2 }, { at: 5 }];
    expect(cameraAt(path, 0, viewport, 1170)).toEqual(cameraFor(undefined, viewport, 1170));
    expect(cameraAt(path, 1, viewport, 1170)).toEqual(cameraFor(focus, viewport, 1170, 2));
    expect(cameraAt(path, 3, viewport, 1170)).toEqual(cameraFor(button, viewport, 1170, 2));
    expect(cameraAt(path, 10, viewport, 1170)).toEqual({ x: 0, y: 0, scale: 1 });
    for (let time = 0; time <= 5; time += .05) {
      const c = cameraAt(path, time, viewport, 1170);
      expect(Math.abs(c.x)).toBeLessThanOrEqual(1170 * (c.scale - 1) / 2 + 1e-8);
      expect(Math.abs(c.y)).toBeLessThanOrEqual(800 / 1280 * 1170 * (c.scale - 1) / 2 + 1e-8);
    }
  });
});
