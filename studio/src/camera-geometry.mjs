export function cameraFocusFitsVisibleViewport(focus, viewport, width, visibleViewport) {
  const ratio = width / viewport.width;
  const height = viewport.height * ratio;
  return focus.width * ratio <= Math.min(width, visibleViewport.width) + 1e-9
    && focus.height * ratio <= Math.min(height, visibleViewport.height) + 1e-9;
}
