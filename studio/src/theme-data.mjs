// CatalogForge-inspired shared presentation tokens. No runtime dependency on CatalogForge.
export const lightTheme = {
  mode: 'light',
  background: '#f7f9fc',
  foreground: '#202d40',
  primary: '#215acb',
  muted: '#657286',
  border: '#e1e6ed',
  tint: '#eff4fc',
  surface: '#ffffff',
  shadow: '#142d52',
  radius: 18,
  font: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif',
};

export const darkTheme = {
  mode: 'dark',
  background: '#0c1422',
  foreground: '#f3f6fb',
  primary: '#77a6ff',
  muted: '#aeb9c9',
  border: '#2b3749',
  tint: '#151f2f',
  surface: '#111b2a',
  shadow: '#000000',
  radius: 18,
  font: lightTheme.font,
};

const HEX = /^#[\da-f]{6}$/i;
function luminance(hex) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function resolveTheme(project = {}) {
  const appearance = project.appearance ?? project;
  const requested = appearance.surfaceMode ?? 'light';
  const mode = requested === 'auto'
    ? HEX.test(appearance.background ?? '') && luminance(appearance.background) < 0.32 ? 'dark' : 'light'
    : requested;
  const base = mode === 'dark' ? darkTheme : lightTheme;
  return {
    ...base,
    mode,
    background: appearance.background ?? base.background,
    foreground: appearance.foreground ?? base.foreground,
    muted: appearance.muted ?? base.muted,
    border: appearance.border ?? base.border,
    tint: appearance.tint ?? base.tint,
    surface: appearance.surface ?? base.surface,
    radius: appearance.radius ?? base.radius,
    font: appearance.fontFamily ?? base.font,
  };
}

export const theme = lightTheme;
