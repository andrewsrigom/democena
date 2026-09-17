export const OUTPUT_CANVAS: Readonly<{ width: 1920; height: 1080 }>;
export function fullBleedLayout(
  viewport: { width: number; height: number },
  canvas: { width: number; height: number },
): { width: number; height: number; left: number; top: number; chromeHeight: 0 };
