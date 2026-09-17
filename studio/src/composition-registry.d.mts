import type { CaptionPlacement, ChromeMode, CompositionLayout, Scene, TypographicRole } from './model.js';

export const compositionLayouts: readonly ['framed', 'full-bleed', 'product-stage', 'detail-crop', 'layered-product', 'full-bleed-proof'];
export const captionPlacements: readonly ['side', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none'];
export const chromeModes: readonly ['auto', 'show', 'hide'];
export const typographicRoles: readonly ['hero', 'statement', 'metadata', 'proof', 'label', 'silent-product'];

export type CompositionDefinition = {
  id: CompositionLayout;
  purpose: string;
  immersive: boolean;
  requiresFocus: boolean;
  defaultCaption: CaptionPlacement;
  layers: { background: string; midground: string; foreground: string };
};

export const compositionRegistry: Record<CompositionLayout, CompositionDefinition>;
export function sceneComposition(scene: Scene): CompositionDefinition & {
  caption: CaptionPlacement;
  chromeVisible: boolean;
  typographicRole: TypographicRole;
};
