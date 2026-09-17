function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function presentationChromeOpacity(activeFullBleed: boolean, previousFullBleed: boolean, activeEnter: number) {
  if (activeFullBleed && previousFullBleed) return 0;
  if (activeFullBleed) return 1 - clamp(activeEnter / 0.35);
  if (previousFullBleed) return clamp((activeEnter - 0.65) / 0.35);
  return 1;
}
