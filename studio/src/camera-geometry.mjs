export function cameraFocusFitsVisibleViewport(focus, viewport, width, visibleViewport) {
  const ratio = width / viewport.width;
  const height = viewport.height * ratio;
  return focus.width * ratio <= Math.min(width, visibleViewport.width) + 1e-9
    && focus.height * ratio <= Math.min(height, visibleViewport.height) + 1e-9;
}

export function fittedCameraScale(focus, viewport, width, zoom, visibleViewport) {
  const ratio = width / viewport.width;
  const height = viewport.height * ratio;
  const visibleWidth = Math.min(width, visibleViewport?.width ?? width);
  const visibleHeight = Math.min(height, visibleViewport?.height ?? height);
  return Math.max(1, Math.min(zoom, (visibleWidth - 48) / (focus.width * ratio), (visibleHeight - 48) / (focus.height * ratio)));
}

export function cameraFocusSupportsMinimumZoom(focus, viewport, width, zoom, minimumZoom, visibleViewport) {
  return fittedCameraScale(focus, viewport, width, zoom, visibleViewport) + 1e-9 >= minimumZoom;
}
