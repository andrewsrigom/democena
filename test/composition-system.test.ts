import { describe, expect, it } from 'vitest';
import { captionPlacements, chromeModes, compositionLayouts, compositionRegistry, sceneComposition, sceneRendersFramedBrowser, typographicRoles } from '../studio/src/composition-registry.mjs';
import { productLayout } from '../studio/src/layout.js';
import type { Project, Scene } from '../studio/src/model.js';
import { prepareProject } from '../studio/src/timeline.js';

const viewport = { width: 1280, height: 800 };
const canvas = { width: 1920, height: 1080 };
const base = { duration: 4, eyebrow: 'Evidence', title: 'A verified product moment.', body: 'Measured from the adopted take.' };
const focus = { x: 820, y: 240, width: 320, height: 220 };

function project(scene: Scene): Project {
  return { version: 2, title: 'Composition fixture', accent: '#215acb', video: 'captures/demo.mp4', sourceDuration: 10, trimBefore: 0, viewport, scenes: [scene] };
}

describe('composition system', () => {
  it('publishes a complete six-layout grammar with structured layers', () => {
    expect(compositionLayouts).toEqual(['framed', 'full-bleed', 'product-stage', 'detail-crop', 'layered-product', 'full-bleed-proof']);
    expect(captionPlacements).toEqual(['side', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none']);
    expect(chromeModes).toEqual(['auto', 'show', 'hide']);
    expect(typographicRoles).toEqual(['hero', 'statement', 'metadata', 'proof', 'label', 'silent-product']);
    for (const layout of compositionLayouts) {
      const entry = compositionRegistry[layout];
      expect(entry.id).toBe(layout);
      expect(Object.keys(entry.layers)).toEqual(['background', 'midground', 'foreground']);
      expect(Object.values(entry.layers).every(Boolean)).toBe(true);
    }
  });

  it('resolves layout defaults and honors per-beat caption and chrome choices', () => {
    const framed = sceneComposition({ ...base, id: 'framed', type: 'overview', source: { from: 0, freeze: true } });
    expect(framed).toMatchObject({ id: 'framed', caption: 'side', chromeVisible: true, chromeBackdropVisible: false, typographicRole: 'statement' });
    const immersive = sceneComposition({ ...base, id: 'proof', type: 'focus', source: { from: 0, freeze: true }, focus,
      typographicRole: 'proof', chrome: 'show', presentation: { layout: 'full-bleed-proof', caption: 'top-right' } });
    expect(immersive).toMatchObject({ id: 'full-bleed-proof', caption: 'top-right', chromeVisible: true, chromeBackdropVisible: true, typographicRole: 'proof' });
    const silent = sceneComposition({ ...base, id: 'silent', type: 'overview', source: { from: 0, freeze: true },
      typographicRole: 'silent-product', chrome: 'hide', presentation: { layout: 'product-stage' } });
    expect(silent).toMatchObject({ id: 'product-stage', caption: 'none', chromeVisible: false, typographicRole: 'silent-product' });
  });

  it('reports browser-bar title usage independently from captions and global chrome', () => {
    const hiddenChromeStage: Scene = { ...base, id: 'stage', type: 'overview', source: { from: 0, freeze: true }, chrome: 'hide',
      presentation: { layout: 'product-stage', caption: 'top-left' } };
    expect(sceneComposition(hiddenChromeStage)).toMatchObject({ caption: 'top-left', chromeVisible: false });
    expect(sceneRendersFramedBrowser(hiddenChromeStage)).toBe(true);
    expect(sceneRendersFramedBrowser({ ...hiddenChromeStage, presentation: { layout: 'full-bleed', caption: 'top-left' } })).toBe(false);
    expect(sceneRendersFramedBrowser({ ...base, id: 'comparison', type: 'result', source: { from: 0, freeze: true },
      comparison: { before: 0, after: 1, crop: focus, beforeLabel: 'Before', afterLabel: 'After' } })).toBe(false);
  });

  it('keeps every product layout on canvas and gives layered product a second evidence surface', () => {
    for (const id of compositionLayouts) {
      const layout = productLayout(id, viewport, canvas);
      expect(layout.primary.width).toBeGreaterThan(0);
      expect(layout.primary.height).toBeGreaterThan(0);
      expect(layout.primary.left).toBeGreaterThanOrEqual(-400);
      expect(layout.primary.top).toBeGreaterThanOrEqual(-100);
      expect(layout.primary.left + layout.primary.width).toBeLessThanOrEqual(canvas.width + 400);
      expect(layout.primary.top + layout.primary.height).toBeLessThanOrEqual(canvas.height + 100);
      expect(Boolean(layout.secondary)).toBe(id === 'layered-product');
      if (!compositionRegistry[id].immersive) {
        expect(layout.primary.top + layout.primary.chromeHeight + layout.primary.height).toBeLessThanOrEqual(960);
      }
    }
    expect(productLayout('product-stage', viewport, canvas).primary).not.toEqual(productLayout('framed', viewport, canvas).primary);
    expect(productLayout('detail-crop', viewport, canvas).primary).not.toEqual(productLayout('product-stage', viewport, canvas).primary);
  });

  it('validates focus-bound compositions and silent product typography before render', () => {
    const overview: Scene = { ...base, id: 'stage', type: 'overview', source: { from: 0, freeze: true },
      typographicRole: 'metadata', chrome: 'hide', presentation: { layout: 'product-stage', caption: 'top-left' } };
    expect(prepareProject(project(overview)).scenes[0]).toMatchObject({ typographicRole: 'metadata', chrome: 'hide' });
    const detail = { ...overview, id: 'detail', type: 'focus' as const, focus, presentation: { layout: 'detail-crop' as const, caption: 'side' as const } };
    expect(prepareProject(project(detail)).scenes[0]).toMatchObject({ presentation: { layout: 'detail-crop' } });
    expect(() => prepareProject(project({ ...overview, presentation: { layout: 'detail-crop' } }))).toThrow(/requires an evidence-linked focus rectangle/);
    expect(() => prepareProject(project({ ...overview, typographicRole: 'silent-product', presentation: { layout: 'product-stage', caption: 'top-left' } }))).toThrow(/cannot render a caption/);
    expect(() => prepareProject(project({ ...base, id: 'copy', type: 'text', typographicRole: 'silent-product' }))).toThrow(/only available on product scenes/);
  });
});
