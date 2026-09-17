export const compositionLayouts = ['framed', 'full-bleed', 'product-stage', 'detail-crop', 'layered-product', 'full-bleed-proof'];
export const captionPlacements = ['side', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none'];
export const chromeModes = ['auto', 'show', 'hide'];
export const typographicRoles = ['hero', 'statement', 'metadata', 'proof', 'label', 'silent-product'];

export const compositionRegistry = {
  framed: {
    id: 'framed', purpose: 'Keep explanatory copy beside a complete browser surface.', immersive: false, requiresFocus: false, defaultCaption: 'side',
    layers: { background: 'canvas', midground: 'browser', foreground: 'side-caption' },
  },
  'full-bleed': {
    id: 'full-bleed', purpose: 'Use the captured product as the entire canvas.', immersive: true, requiresFocus: false, defaultCaption: 'bottom-left',
    layers: { background: 'capture', midground: 'product-motion', foreground: 'overlay-caption' },
  },
  'product-stage': {
    id: 'product-stage', purpose: 'Present the complete product as a large designed object with depth and breathing room.', immersive: false, requiresFocus: false, defaultCaption: 'top-left',
    layers: { background: 'ambient-grid', midground: 'raised-product-stage', foreground: 'metadata-caption' },
  },
  'detail-crop': {
    id: 'detail-crop', purpose: 'Give one evidence-linked interface detail most of the frame.', immersive: false, requiresFocus: true, defaultCaption: 'side',
    layers: { background: 'focus-wash', midground: 'measured-detail', foreground: 'detail-label' },
  },
  'layered-product': {
    id: 'layered-product', purpose: 'Build depth from two views of the same captured product.', immersive: false, requiresFocus: false, defaultCaption: 'bottom-left',
    layers: { background: 'depth-field', midground: 'stacked-product', foreground: 'overlay-caption' },
  },
  'full-bleed-proof': {
    id: 'full-bleed-proof', purpose: 'Fill the canvas with captured evidence and keep its verified claim attached.', immersive: true, requiresFocus: true, defaultCaption: 'bottom-left',
    layers: { background: 'capture', midground: 'evidence-lock', foreground: 'proof-card' },
  },
};

export function sceneComposition(scene) {
  const productScene = !['text', 'chapter', 'outro'].includes(scene.type);
  const layout = productScene && 'presentation' in scene ? scene.presentation?.layout ?? 'framed' : 'framed';
  const definition = compositionRegistry[layout] ?? compositionRegistry.framed;
  const typographicRole = scene.typographicRole ?? (scene.type === 'chapter' ? 'label' : scene.type === 'result' ? 'proof' : scene.type === 'text' ? 'hero' : 'statement');
  const caption = typographicRole === 'silent-product' ? 'none'
    : productScene ? ('presentation' in scene ? scene.presentation?.caption : undefined) ?? definition.defaultCaption
      : 'none';
  const chromeVisible = scene.chrome === 'show' ? true : scene.chrome === 'hide' ? false : !definition.immersive;
  const chromeBackdropVisible = chromeVisible && definition.immersive;
  return { ...definition, caption, chromeVisible, chromeBackdropVisible, typographicRole };
}

export function sceneRendersFramedBrowser(scene) {
  const productScene = !['text', 'chapter', 'outro'].includes(scene.type);
  const comparison = scene.type === 'result' && Boolean(scene.comparison);
  return productScene && !comparison && !sceneComposition(scene).immersive;
}
