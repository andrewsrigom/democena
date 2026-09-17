function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function presentationChromeOpacity(activeVisible: boolean, previousVisible: boolean, activeEnter: number) {
  if (activeVisible && previousVisible) return 1;
  if (!activeVisible && !previousVisible) return 0;
  if (!activeVisible) return 1 - clamp(activeEnter / 0.35);
  return clamp((activeEnter - 0.65) / 0.35);
}
