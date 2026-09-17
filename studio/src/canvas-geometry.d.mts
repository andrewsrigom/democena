import type { CompositionLayout } from './model.js';

export type ProductLayoutBox = { width: number; height: number; left: number; top: number; chromeHeight: number };
export const OUTPUT_CANVAS: Readonly<{ width: 1920; height: 1080 }>;
export function browserLayout(viewport: { width: number; height: number }): ProductLayoutBox;
export function fullBleedLayout(
  viewport: { width: number; height: number },
  canvas: { width: number; height: number },
): { width: number; height: number; left: number; top: number; chromeHeight: 0 };
export function productLayout(
  layout: CompositionLayout,
  viewport: { width: number; height: number },
  canvas: { width: number; height: number },
): { primary: ProductLayoutBox; secondary?: ProductLayoutBox };
