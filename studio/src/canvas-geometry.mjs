export const OUTPUT_CANVAS = Object.freeze({ width: 1920, height: 1080 });

/** Cover the output canvas with the recorded viewport and crop only the overflow. */
export function fullBleedLayout(viewport, canvas) {
  const width = Math.max(canvas.width, canvas.height * viewport.width / viewport.height);
  const height = width * viewport.height / viewport.width;
  return { width, height, left: (canvas.width - width) / 2, top: (canvas.height - height) / 2, chromeHeight: 0 };
}
