export const OUTPUT_CANVAS = Object.freeze({ width: 1920, height: 1080 });

function framedStageLayout(viewport, stage) {
  const chromeHeight = 48;
  const width = Math.min(stage.width, (stage.height - chromeHeight) * viewport.width / viewport.height);
  const height = width * viewport.height / viewport.width;
  return {
    width, height,
    left: stage.left + (stage.width - width) / 2,
    top: stage.top + (stage.height - chromeHeight - height) / 2,
    chromeHeight,
  };
}

export function browserLayout(viewport) {
  return framedStageLayout(viewport, { left: 664, top: 158, width: 1160, height: 780 });
}

/** Cover the output canvas with the recorded viewport and crop only the overflow. */
export function fullBleedLayout(viewport, canvas) {
  const width = Math.max(canvas.width, canvas.height * viewport.width / viewport.height);
  const height = width * viewport.height / viewport.width;
  return { width, height, left: (canvas.width - width) / 2, top: (canvas.height - height) / 2, chromeHeight: 0 };
}

export function productLayout(layout, viewport, canvas) {
  if (layout === 'full-bleed' || layout === 'full-bleed-proof') return { primary: fullBleedLayout(viewport, canvas) };
  if (layout === 'product-stage') return { primary: framedStageLayout(viewport, { left: 250, top: 126, width: 1420, height: 820 }) };
  if (layout === 'detail-crop') return { primary: framedStageLayout(viewport, { left: 604, top: 122, width: 1250, height: 838 }) };
  if (layout === 'layered-product') return {
    primary: framedStageLayout(viewport, { left: 494, top: 168, width: 1300, height: 780 }),
    secondary: framedStageLayout(viewport, { left: 690, top: 140, width: 1040, height: 724 }),
  };
  return { primary: browserLayout(viewport) };
}
