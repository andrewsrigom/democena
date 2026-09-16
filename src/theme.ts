// Modified for Democena (2026): CatalogForge-inspired blue palette and typography.
/**
 * The look of the overlay.
 *
 * Everything the layer paints comes from here, so a recording can carry someone else's colours
 * without a fork. Two themes ship, and the second one exists to prove the first is not hard-coded.
 */

export interface Theme {
  /** Font stack for every piece of overlay text. */
  fontFamily: string;
  /** Step badge, cursor and spotlight frame. */
  accent: string;
  /** Text drawn on top of `accent`. */
  onAccent: string;
  /** Background of the subtitle. May be translucent; the page shows through. */
  surface: string;
  /** Background of the title card. Opaque, because the card covers the application. */
  cardSurface: string;
  /** Subtitle and title-card text. */
  text: string;
  /** The quieter line: the card's subtitle. */
  muted: string;
  /** What covers the page outside a spotlight. */
  dim: string;
  /**
   * Where the subtitle sits. `top` by default: on a dashboard the bottom is exactly where new rows
   * appear, so a subtitle down there covers what it points at.
   */
  captionPosition: 'top' | 'bottom';
  /** Distance in pixels from that edge. */
  captionOffset: number;
  captionFontSize: number;
  /** CSS length, so `78%` and `900px` both work. */
  captionMaxWidth: string;
  /** Corner radius for the subtitle and the spotlight frame. */
  radius: number;
  /** Draw the step number in front of the subtitle. */
  badge: boolean;
}

export const defaultTheme: Theme = {
  fontFamily:
    'Inter, "Segoe UI", system-ui, -apple-system, sans-serif',
  accent: '#215acb',
  onAccent: '#ffffff',
  surface: 'rgba(15, 23, 42, 0.94)',
  cardSurface: '#0f172a',
  text: '#f8fafc',
  muted: '#94a3b8',
  dim: 'rgba(15, 23, 42, 0.28)',
  captionPosition: 'top',
  captionOffset: 64,
  captionFontSize: 21,
  captionMaxWidth: '78%',
  radius: 12,
  badge: true,
};

/**
 * For applications that are light themselves, where a dark subtitle block reads as a foreign object.
 * The dim stays light-grey rather than dark, so a spotlight on a white page still lifts.
 */
export const lightTheme: Theme = {
  ...defaultTheme,
  accent: '#215acb',
  onAccent: '#ffffff',
  surface: 'rgba(255, 255, 255, 0.96)',
  cardSurface: '#f7f9fc',
  text: '#202d40',
  muted: '#7b8799',
  dim: 'rgba(20, 45, 82, 0.18)',
};

export const themes = { dark: defaultTheme, light: lightTheme } as const;

export type ThemeName = keyof typeof themes;

/** A theme by name, or overrides on top of one, or both. */
export type ThemeInput = ThemeName | (Partial<Theme> & { base?: ThemeName });

export function resolveTheme(theme?: ThemeInput): Theme {
  if (theme === undefined) return { ...defaultTheme };
  if (typeof theme === 'string') return { ...themes[theme] };
  const { base, ...overrides } = theme;
  return { ...themes[base ?? 'dark'], ...overrides };
}
