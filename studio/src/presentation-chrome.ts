import type { CaptionPlacement, CompositionLayout } from './model.js';

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function presentationChromeOpacity(activeVisible: boolean, previousVisible: boolean, activeEnter: number) {
  if (activeVisible && previousVisible) return 1;
  if (!activeVisible && !previousVisible) return 0;
  if (!activeVisible) return 1 - clamp(activeEnter / 0.35);
  return clamp((activeEnter - 0.65) / 0.35);
}

export function presentationChromeBackdropOpacity(
  activeBacked: boolean,
  previousBacked: boolean,
  activeVisible: boolean,
  previousVisible: boolean,
  activeEnter: number,
) {
  if (activeVisible && previousVisible) {
    if (activeBacked) return 1;
    if (previousBacked) return activeEnter < 1 ? 1 : 0;
    return 0;
  }
  return presentationChromeOpacity(activeBacked, previousBacked, activeEnter);
}

/** Compensate for the outer chrome group's opacity so the backdrop fades exactly once. */
export function nestedChromeBackdropOpacity(chromeOpacity: number, backdropOpacity: number) {
  if (chromeOpacity <= 0 || backdropOpacity <= 0) return 0;
  return clamp(backdropOpacity / chromeOpacity);
}

export function presentationChromeUsesBackdrop(activeBacked: boolean, previousBacked: boolean, activeEnter: number) {
  return activeBacked || (previousBacked && activeEnter < 1);
}

export function overlayCaptionTop(position: CaptionPlacement, layout: CompositionLayout, chromeVisible: boolean) {
  if (!position.startsWith('top')) return undefined;
  if (chromeVisible) return 190;
  return layout === 'product-stage' ? 150 : 96;
}

export function overlayCaptionBottom(position: CaptionPlacement, chromeVisible: boolean) {
  if (!position.startsWith('bottom')) return undefined;
  return chromeVisible ? 160 : 96;
}

export function compactChapterChrome(layout: CompositionLayout) {
  return layout === 'product-stage' || layout === 'detail-crop';
}
